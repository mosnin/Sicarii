// Email + suppression MCP tools for the operator's own agent.
//
// send_email is the first outbound-mutating tool on the server. It is safe to
// expose because it does not reach the mail provider directly: it calls the
// send chokepoint (src/lib/email-send.ts), which refuses a suppressed
// recipient, enforces the daily cap and send window, and attaches an
// unsubscribe link before anything leaves. An agent cannot skip those rules,
// because there is no path to the provider that does not go through the
// chokepoint.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { sendOutboundEmail } from "@/lib/email-send";
import { addSuppression, removeSuppression, listSuppressions } from "@/lib/suppression";
import { createSequence, listSequences, enrollContact, setSequenceActive } from "@/lib/sequences";

export interface ToolResult {
  // The SDK's CallToolResult carries an index signature; without it a Promise
  // of this type does not assign to the tool callback's return.
  [x: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface EmailToolContext {
  userIdFrom: (extra: { authInfo?: AuthInfo }) => string;
  run: (fn: () => Promise<unknown>) => Promise<ToolResult>;
  gated: (
    extra: { authInfo?: AuthInfo },
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ) => Promise<ToolResult>;
}

export function registerEmailTools(server: McpServer, ctx: EmailToolContext): void {
  server.tool(
    "send_email",
    "Send an outbound email to a contact through the operator's connected Gmail. This is a REAL send. It automatically refuses a recipient on the suppression list, respects the mailbox's daily cap and send window, and appends a one-click unsubscribe link, so you never have to handle opt-outs yourself. Requires a connected mailbox (returns a clear error if none). Costs credits. Prefer passing contactId so the send is attributed and advances the contact's pipeline state; pass variantId from select_variant when the subject/opener came from the bandit. Ground the message only in what you actually know about the contact, never invented facts.",
    {
      to: z.string().email(),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(20000),
      contactId: z.string().optional(),
      variantId: z.string().optional().describe("id of the OutreachVariant used, from select_variant"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a, extra) =>
      ctx.gated(extra, "send_email", 60, (userId) =>
        sendOutboundEmail(userId, {
          to: a.to,
          subject: a.subject,
          body: a.body,
          contactId: a.contactId ?? null,
          variantId: a.variantId ?? null,
        }),
      ),
  );

  server.tool(
    "add_suppression",
    "Add an email address or a whole domain to the suppression list so nothing is ever sent to it again. Use this the moment someone asks to be removed, replies asking to stop, or bounces hard. Scope defaults to ALL (blocks email and calls, inbound and outbound). Supply exactly one of email or domain.",
    {
      email: z.string().email().optional(),
      domain: z.string().min(3).max(253).optional(),
      scope: z.enum(["INBOUND", "OUTBOUND", "ALL"]).optional(),
      reason: z.string().max(500).optional(),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (a, extra) => ctx.gated(extra, "add_suppression", 120, (userId) => addSuppression(userId, a)),
  );

  server.tool(
    "remove_suppression",
    "Remove an email address or domain from the suppression list, so it can be contacted again. Supply exactly one of email or domain. Use only on an explicit operator instruction; never to work around an opt-out.",
    {
      email: z.string().email().optional(),
      domain: z.string().min(3).max(253).optional(),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async (a, extra) => ctx.gated(extra, "remove_suppression", 120, (userId) => removeSuppression(userId, a)),
  );

  server.tool(
    "list_suppressions",
    "List the addresses and domains on the suppression list (who must not be contacted), emails then domains. Check this before a big send if you are unsure.",
    { limit: z.number().int().min(1).max(500).optional() },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (a, extra) => ctx.run(() => listSuppressions(ctx.userIdFrom(extra), { limit: a.limit })),
  );

  /* ------------------------------ sequences ----------------------------- */

  server.tool(
    "create_sequence",
    "Create a multi-step outreach cadence: an ordered list of email steps, each with a delay in days before it fires (step 1's delay is measured from enrollment). Once you enroll a contact, Scalar sends each step on schedule through the same safe path as send_email (suppression, daily cap, unsubscribe link all enforced), and STOPS the cadence automatically the moment the contact replies. Write each step's subject and body as a template grounded in what you know; keep it to a few steps. This is how you run outreach that works while the operator is away.",
    {
      name: z.string().min(1).max(200),
      steps: z
        .array(
          z.object({
            delayDays: z.number().int().min(0).max(365),
            subject: z.string().min(1).max(300),
            body: z.string().min(1).max(20000),
          }),
        )
        .min(1)
        .max(20),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (a, extra) => ctx.gated(extra, "create_sequence", 60, (userId) => createSequence(userId, a)),
  );

  server.tool(
    "list_sequences",
    "List this operator's outreach sequences with their steps and how many contacts are enrolled in each.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (_a, extra) => ctx.run(() => listSequences(ctx.userIdFrom(extra))),
  );

  server.tool(
    "enroll_in_sequence",
    "Enroll a contact into a sequence, which starts the cadence. Idempotent: a contact already in the sequence is left as-is, never given a second overlapping cadence. Refuses if the contact has no email or is suppressed. The cadence stops itself when the contact replies, so you never chase a reply.",
    { sequenceId: z.string(), contactId: z.string() },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (a, extra) => ctx.gated(extra, "enroll_in_sequence", 120, (userId) => enrollContact(userId, a.sequenceId, a.contactId)),
  );

  server.tool(
    "set_sequence_active",
    "Pause or resume a sequence. A paused sequence sends no further steps and accepts no new enrollments until resumed.",
    { sequenceId: z.string(), active: z.boolean() },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (a, extra) => ctx.gated(extra, "set_sequence_active", 120, (userId) => setSequenceActive(userId, a.sequenceId, a.active)),
  );
}
