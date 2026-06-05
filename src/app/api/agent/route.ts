import { NextResponse } from "next/server";
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  OpError,
  listEntities,
  getEntity,
  createEntity,
  updateEntity,
  enrichEntity,
  listContacts,
  getContact,
  createContact,
  updateContact,
  searchCrm,
} from "@/lib/crm-operations";
import { tavilySearch, isTavilyConfigured } from "@/lib/tavily";
import { storeMemory, recallMemory } from "@/lib/memory";

export const maxDuration = 60;

const MODEL = process.env.OPENAI_AGENT_MODEL ?? "gpt-4o";

const SYSTEM = `You are Scalar, the research and context agent built into this CRM. \
Your name is Scalar and you should refer to yourself as Scalar when introducing \
yourself or when context makes it natural. You discover businesses, enrich them, \
and manage entities (businesses) and contacts (people) on behalf of the operator.

How you work:
- To find leads, use search_web (e.g. "nail salons in Miami"), summarize what you
  found, then ASK before pushing them into the CRM. On confirmation, use
  create_entity for each business.
- Enrich a business with enrich_entity.
- Read/write the CRM with the list/get/create/update tools. Always work from real
  data — call tools rather than guessing.
- You have long-term memory: call recall to retrieve relevant past context (earlier
  conversations and CRM notes) instead of assuming. Each chat starts fresh, so
  recall is how you remember.
- Be concise and action-oriented. Confirm before bulk writes.

Response style — critical:
- Write in plain conversational prose. No markdown: no **bold**, no bullet lists,
  no numbered lists, no [links](url), no headers. Just clear direct sentences.
- When listing results, use natural language: "I found 3 companies: Acme (acme.com),
  Widget Co (widgetco.com), and FooBar (foobar.com)."
- Keep responses short. One tight paragraph is almost always enough.`;

function uiMessageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

// Turn an ops call into a tool result, mapping OpErrors to a clean payload.
async function exec(fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OpError) return { error: e.message };
    // Async Synthoz tool — not an error, result incoming via webhook.
    if (e instanceof Error && e.name === "SynthozQueuedError") {
      return { queued: true, message: "Request queued — result will appear in the CRM via webhook." };
    }
    console.error("agent tool error", e);
    return { error: "Internal error" };
  }
}

export async function POST(req: Request) {
  let userId: string;
  let productContext: string | null = null;
  try {
    const user = await getAuthenticatedUser();
    userId = user.id;
    productContext = user.productContext;
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "The agent isn't configured yet — add OPENAI_API_KEY." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    messages?: UIMessage[];
    conversationId?: string;
  } | null;
  const incoming = body?.messages ?? [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }

  // Ensure a conversation row exists (owned by this user). The client supplies a
  // fresh id per page load; we reuse it across the session's turns.
  let conversationId = body?.conversationId;
  if (conversationId) {
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!existing) {
      await prisma.conversation.create({ data: { id: conversationId, userId } });
    } else if (existing.userId !== userId) {
      conversationId = (await prisma.conversation.create({ data: { userId } })).id;
    }
  } else {
    conversationId = (await prisma.conversation.create({ data: { userId } })).id;
  }

  // Persist + remember the latest user turn.
  const lastUser = [...incoming].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser ? uiMessageText(lastUser) : "";
  if (lastUserText) {
    await prisma.message.create({
      data: { conversationId, role: "user", content: lastUserText },
    });
    await storeMemory(userId, "message", `Operator: ${lastUserText}`, conversationId);
  }

  const tools = {
    recall: tool({
      description:
        "Recall relevant past context (earlier conversations and CRM notes) by similarity. Use before assuming you don't know something.",
      inputSchema: z.object({ query: z.string() }),
      execute: ({ query }) => recallMemory(userId, query),
    }),
    search_web: tool({
      description:
        "Search the web (Tavily) to discover businesses, e.g. 'nail salons in Miami'.",
      inputSchema: z.object({
        query: z.string(),
        maxResults: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, maxResults }) => {
        if (!isTavilyConfigured())
          return { error: "Web search isn't configured (TAVILY_API_KEY missing)." };
        return exec(() => tavilySearch(query, { maxResults }));
      },
    }),
    search_crm: tool({
      description: "Search across entities and contacts in the CRM.",
      inputSchema: z.object({ query: z.string() }),
      execute: ({ query }) => exec(() => searchCrm(userId, query)),
    }),
    list_entities: tool({
      description: "List businesses (entities). Optional search query.",
      inputSchema: z.object({ query: z.string().optional() }),
      execute: ({ query }) => exec(() => listEntities(userId, query)),
    }),
    get_entity: tool({
      description: "Get one business by id, including its contacts.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => exec(() => getEntity(userId, id)),
    }),
    create_entity: tool({
      description: "Create a business (entity) in the CRM.",
      inputSchema: z.object({
        name: z.string(),
        domain: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: (args) => exec(() => createEntity(userId, { ...args, source: "agent" })),
    }),
    update_entity: tool({
      description: "Update fields on a business.",
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        domain: z.string().optional(),
        industry: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: ({ id, ...rest }) => exec(() => updateEntity(userId, id, rest)),
    }),
    enrich_entity: tool({
      description:
        "Enrich a business via Synthoz using its domain (company data + contacts).",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => exec(() => enrichEntity(userId, id)),
    }),
    list_contacts: tool({
      description: "List people (contacts). Optional search query and status.",
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.string().optional(),
      }),
      execute: ({ query, status }) =>
        exec(() => listContacts(userId, { q: query, status })),
    }),
    get_contact: tool({
      description: "Get one contact by id, with linked entity and saved emails.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => exec(() => getContact(userId, id)),
    }),
    create_contact: tool({
      description: "Create a person (contact). Optionally assign to an entity.",
      inputSchema: z.object({
        name: z.string().optional(),
        email: z.string().optional(),
        title: z.string().optional(),
        company: z.string().optional(),
        notes: z.string().optional(),
        entityId: z.string().optional(),
      }),
      execute: (args) => exec(() => createContact(userId, { ...args, source: "agent" })),
    }),
    update_contact: tool({
      description: "Update fields on a contact (including status, entity).",
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        title: z.string().optional(),
        notes: z.string().optional(),
        entityId: z.string().optional(),
      }),
      execute: ({ id, ...rest }) => exec(() => updateContact(userId, id, rest)),
    }),
  };

  const modelMessages = await convertToModelMessages(incoming);

  const system = productContext?.trim()
    ? `${SYSTEM}\n\nProduct context — what the operator sells (use it to inform discovery, qualification, and outreach):\n${productContext.trim()}`
    : SYSTEM;

  const result = streamText({
    model: openai(MODEL),
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(12),
    onFinish: async ({ text }) => {
      if (!text?.trim()) return;
      await prisma.message.create({
        data: { conversationId: conversationId!, role: "assistant", content: text },
      });
      await storeMemory(userId, "message", `Scalar: ${text}`, conversationId);
    },
  });

  return result.toUIMessageStreamResponse();
}
