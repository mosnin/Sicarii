import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { authenticateApiKey, bearerFromRequest } from "@/lib/api-auth";
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
  saveEmail,
  searchCrm,
} from "@/lib/crm-operations";
import { tavilySearch, isTavilyConfigured } from "@/lib/tavily";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// Read the authenticated user id injected by withMcpAuth.
function userIdFrom(extra: { authInfo?: AuthInfo }): string {
  const id = (extra.authInfo?.extra as { userId?: string } | undefined)?.userId;
  if (!id) throw new OpError("Unauthorized", 401);
  return id;
}

// Wrap a tool body so OpErrors become clean tool errors instead of 500s.
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof OpError) return fail(e.message);
    console.error("MCP tool error", e);
    return fail("Internal error");
  }
}

const handler = createMcpHandler(
  (server) => {
    /* -------------------------- Entities -------------------------- */
    server.tool(
      "list_entities",
      "List businesses (entities) in the CRM, newest first. Optional search query over name/domain/industry.",
      { query: z.string().optional() },
      async ({ query }, extra) =>
        run(() => listEntities(userIdFrom(extra), query)),
    );

    server.tool(
      "get_entity",
      "Get one business by id, including its contacts.",
      { id: z.string() },
      async ({ id }, extra) => run(() => getEntity(userIdFrom(extra), id)),
    );

    server.tool(
      "create_entity",
      "Create a business (entity) in the CRM.",
      {
        name: z.string(),
        domain: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        size: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      async (args, extra) =>
        run(() =>
          createEntity(userIdFrom(extra), { ...args, source: "agent" }),
        ),
    );

    server.tool(
      "update_entity",
      "Update fields on a business.",
      {
        id: z.string(),
        name: z.string().optional(),
        domain: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["NEW", "ENRICHED", "ARCHIVED"]).optional(),
        tags: z.array(z.string()).optional(),
      },
      async ({ id, ...rest }, extra) =>
        run(() => updateEntity(userIdFrom(extra), id, rest)),
    );

    server.tool(
      "enrich_entity",
      "Enrich a business via Synthoz using its domain (pulls company data + contacts). Stores the result on the entity.",
      { id: z.string() },
      async ({ id }, extra) => run(() => enrichEntity(userIdFrom(extra), id)),
    );

    /* -------------------------- Contacts -------------------------- */
    server.tool(
      "list_contacts",
      "List people (contacts), newest first. Optional search query and status filter.",
      {
        query: z.string().optional(),
        status: z.string().optional(),
      },
      async ({ query, status }, extra) =>
        run(() => listContacts(userIdFrom(extra), { q: query, status })),
    );

    server.tool(
      "get_contact",
      "Get one contact by id, including linked entity and saved email context.",
      { id: z.string() },
      async ({ id }, extra) => run(() => getContact(userIdFrom(extra), id)),
    );

    server.tool(
      "create_contact",
      "Create a person (contact). Optionally assign to an entity by entityId.",
      {
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        website: z.string().optional(),
        linkedin: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        entityId: z.string().optional(),
      },
      async (args, extra) =>
        run(() =>
          createContact(userIdFrom(extra), { ...args, source: "agent" }),
        ),
    );

    server.tool(
      "update_contact",
      "Update fields on a contact (including status and entity assignment).",
      {
        id: z.string(),
        name: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        company: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        status: z
          .enum([
            "NEW",
            "ENRICHED",
            "CONTACTED",
            "REPLIED",
            "QUALIFIED",
            "WON",
            "LOST",
            "ARCHIVED",
          ])
          .optional(),
        notes: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        entityId: z.string().nullable().optional(),
      },
      async ({ id, ...rest }, extra) =>
        run(() => updateContact(userIdFrom(extra), id, rest)),
    );

    /* ------------------------ Email context ----------------------- */
    server.tool(
      "save_email_context",
      "Save an email exchanged with a contact onto their record as reusable context.",
      {
        contactId: z.string(),
        direction: z.enum(["INBOUND", "OUTBOUND"]),
        subject: z.string().optional(),
        body: z.string().optional(),
        fromAddr: z.string().optional(),
        toAddr: z.string().optional(),
        savedAsContext: z.boolean().optional(),
      },
      async (args, extra) =>
        run(() =>
          saveEmail(userIdFrom(extra), {
            ...args,
            savedAsContext: args.savedAsContext ?? true,
          }),
        ),
    );

    /* -------------------------- Discovery ------------------------- */
    server.tool(
      "search_crm",
      "Search across both entities and contacts in the CRM.",
      { query: z.string() },
      async ({ query }, extra) =>
        run(() => searchCrm(userIdFrom(extra), query)),
    );

    server.tool(
      "search_web",
      "Search the web (Tavily) to discover businesses, e.g. 'nail salons in Miami'. Returns titles, URLs, and snippets to turn into entities.",
      {
        query: z.string(),
        maxResults: z.number().int().min(1).max(20).optional(),
      },
      async ({ query, maxResults }, extra) => {
        userIdFrom(extra); // ensure authenticated
        if (!isTavilyConfigured())
          return fail("Web search is not configured (TAVILY_API_KEY missing).");
        return run(() => tavilySearch(query, { maxResults }));
      },
    );
  },
  {
    serverInfo: { name: "sicarii", version: "0.1.0" },
  },
  { basePath: "/api/mcp" },
);

// Per-user API key auth: resolve the bearer token to a Sicarii user and inject
// the userId into authInfo.extra for the tools to scope on.
const authHandler = withMcpAuth(
  handler,
  async (req, bearerToken): Promise<AuthInfo | undefined> => {
    const token = bearerToken ?? bearerFromRequest(req);
    const user = await authenticateApiKey(token);
    if (!user) return undefined;
    return {
      token: token as string,
      clientId: user.id,
      scopes: [],
      extra: { userId: user.id },
    };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
