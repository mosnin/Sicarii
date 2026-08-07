// Mailbox and calendar MCP tools, registered onto the shared Scalar MCP server
// by src/app/api/mcp/[transport]/route.ts.
//
// These are the cheapest and most trustworthy tools in the whole server, and
// the descriptions say so on purpose. An agent reaching for a paid enrichment
// vendor to learn someone's job title, when the operator has a thread from
// that person with their signature block in it, is spending credits to get a
// worse answer. First-party history is free, current, and cannot be about a
// same-name stranger.
//
// Everything here is READ-ONLY. There is deliberately no tool to send mail, to
// create a connection, or to flip autoCreateContacts: connecting a mailbox is
// consent, and consent is given by a person in Settings, not by an agent.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OpError } from "@/lib/op-error";
import { listThreads, getThread, listMeetings, readCrmHistory } from "@/lib/mailbox-ingest";
import { connectionStatus } from "@/lib/connections";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** The helpers the MCP route owns and hands down. Kept structural so this
 *  module never imports the route (which would be a cycle). Mirrors
 *  FactsToolContext in facts-tools.ts. */
export interface MailboxToolContext {
  /** Wrap a tool body, turning OpErrors into clean tool errors. */
  run: (fn: () => Promise<unknown>) => Promise<ToolResult>;
  /** Like run(), plus a per-user rate limit; passes the authenticated userId. */
  gated: (
    extra: { authInfo?: AuthInfo },
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ) => Promise<ToolResult>;
  /** Read the authenticated user id injected by withMcpAuth. */
  userIdFrom: (extra: { authInfo?: AuthInfo }) => string;
}

const FIRST_PARTY_NOTE =
  "This is first-party data from the operator's own Gmail and Google Calendar. It beats every data vendor: it is free, it is current, and it cannot be about a same-name stranger. Read it BEFORE spending credits on paid enrichment.";

const READ_CRM_HISTORY_DESCRIPTION = `Everything the operator has actually exchanged with one person or company: email threads plus meetings, newest first, with the most recent email signature blocks attached.

REACH FOR THIS FIRST. ${FIRST_PARTY_NOTE}

Signature blocks are the single best source for a current job title, because people update their signature the week they are promoted, months before any vendor notices. If the answer you need is in here, do not call a paid enrichment tool at all.

Set exactly one of contactId or entityId. Free and read-only.`;

const LIST_THREADS_DESCRIPTION = `List synced email threads, most recent activity first. Optionally narrow to one contact, one company, or a subject search.

${FIRST_PARTY_NOTE}

Returns thread summaries only (subject, participants, message count, dates). Call get_thread for the full message history. Free and read-only.`;

const GET_THREAD_DESCRIPTION = `The full message history of one thread, oldest first: direction, sender, recipients, body text, and any extracted signature block.

Use it to answer "what have we actually said to this person" before drafting outreach, and to check what they said back before deciding a follow-up is due. Free and read-only.`;

const LIST_MEETINGS_DESCRIPTION = `List synced calendar meetings, most recent first, with their attendees and each attendee's CRM contact link where one exists.

A meeting is the strongest engagement signal in the CRM: somebody gave up time. Check it before treating a contact as cold. Optionally narrow to a contact, a company, or a date window. Free and read-only.`;

const CONNECTION_STATUS_DESCRIPTION = `Whether the operator has connected their Gmail and Google Calendar, and whether those connections are healthy.

Call this when a history read comes back empty, so you can tell the difference between "nothing has happened with this person" and "no mailbox is connected". If a connection reports needsReauth, say so to the operator: only they can reconnect it, in Settings.

Note syncingSince: sync is FORWARD-ONLY, so nothing from before that instant exists in the CRM, and its absence is not evidence of anything. Free and read-only.`;

/**
 * Register the mailbox and calendar tools. Called from the MCP route's server
 * initializer.
 */
export function registerMailboxTools(server: McpServer, ctx: MailboxToolContext): void {
  server.tool(
    "read_crm_history",
    READ_CRM_HISTORY_DESCRIPTION,
    {
      contactId: z.string().optional().describe("The contact to read history for (or set entityId)"),
      entityId: z
        .string()
        .optional()
        .describe("The company to read history for, covering every contact attached to it (or set contactId)"),
      limit: z.number().int().min(1).max(200).optional().describe("Threads and meetings to return (default 20)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ contactId, entityId, limit }, extra) =>
      ctx.run(() => {
        if (!contactId && !entityId) throw new OpError("Set exactly one of contactId or entityId", 400);
        if (contactId && entityId) throw new OpError("Set exactly one of contactId or entityId", 400);
        return readCrmHistory(ctx.userIdFrom(extra), { contactId, entityId, limit });
      }),
  );

  server.tool(
    "list_threads",
    LIST_THREADS_DESCRIPTION,
    {
      contactId: z.string().optional().describe("Only threads linked to this contact"),
      entityId: z.string().optional().describe("Only threads linked to this company"),
      query: z.string().max(300).optional().describe("Match against the thread subject"),
      limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 25)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ contactId, entityId, query, limit }, extra) =>
      ctx.run(() => listThreads(ctx.userIdFrom(extra), { contactId, entityId, query, limit })),
  );

  server.tool(
    "get_thread",
    GET_THREAD_DESCRIPTION,
    { threadId: z.string().describe("The thread id returned by list_threads or read_crm_history") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ threadId }, extra) => ctx.run(() => getThread(ctx.userIdFrom(extra), threadId)),
  );

  server.tool(
    "list_meetings",
    LIST_MEETINGS_DESCRIPTION,
    {
      contactId: z.string().optional().describe("Only meetings this contact attended or is linked to"),
      entityId: z.string().optional().describe("Only meetings linked to this company"),
      from: z.string().optional().describe("ISO date: only meetings starting at or after this"),
      to: z.string().optional().describe("ISO date: only meetings starting at or before this"),
      limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 25)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ contactId, entityId, from, to, limit }, extra) =>
      ctx.run(() => {
        const parse = (value: string | undefined, label: string): Date | undefined => {
          if (!value) return undefined;
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) throw new OpError(`${label} is not a valid date`, 400);
          return date;
        };
        return listMeetings(ctx.userIdFrom(extra), {
          contactId,
          entityId,
          from: parse(from, "from"),
          to: parse(to, "to"),
          limit,
        });
      }),
  );

  server.tool(
    "connection_status",
    CONNECTION_STATUS_DESCRIPTION,
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (_args, extra) => ctx.run(() => connectionStatus(ctx.userIdFrom(extra))),
  );
}
