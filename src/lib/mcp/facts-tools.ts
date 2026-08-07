// Evidence-ledger MCP tools, registered onto the shared Scalar MCP server by
// src/app/api/mcp/[transport]/route.ts.
//
// Deliberately absent: any tool that applies or dismisses a proposed fact. An
// agent that could promote its own suggestion would just be writing to the
// record with extra steps, and the suggestion queue exists precisely so a
// person is the one who settles an ambiguous claim. Same reasoning as the
// breakup drafts (src/lib/breakup-operations.ts): the approve path is
// human-session-gated REST only.
//
// Recording is free (CREDIT_COSTS.record_fact is 0) and does not spend, since
// the lookup that produced the observation was already metered by whatever
// enrichment tool made it.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OpError } from "@/lib/op-error";
import { EVIDENCE_KIND_NAMES } from "@/lib/evidence";
import { recordFact, listProposedFacts, getFactEvidence } from "@/lib/facts";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** The helpers the MCP route owns and hands down. Kept structural so this
 *  module never imports the route (which would be a cycle). */
export interface FactsToolContext {
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

const evidenceEntry = z.object({
  kind: z.enum(EVIDENCE_KIND_NAMES).describe("What kind of thing you saw. Use scalar-evidence to pick."),
  detail: z
    .string()
    .max(500)
    .optional()
    .describe(
      "One line a human can read, quoting what you actually saw: \"their signature on 14 July reads Head of Security, Acme\".",
    ),
  sourceUrl: z.string().max(1000).optional().describe("Where you saw it, when there is a URL"),
});

const RECORD_FACT_DESCRIPTION = `Record something you OBSERVED about a contact or company field. You do NOT supply a confidence, ever: you report evidence and Scalar prices it. There is no argument that would let you make a claim count for more, only more evidence you actually gathered.

Give one evidence entry per INDEPENDENT source. Two facts read off the same page are ONE observation, and entries are deduped by kind, so splitting a page into three entries buys nothing. NEVER report evidence you did not observe.

Outcomes, all three of them fine:
- Strong enough, from a source that identifies this exact person or company: the value is written onto the record and logged as applied.
- Anything weaker: it is stored as a suggestion for a human to settle. This is a GOOD result, not a failure. Do not go hunting extra evidence just to push a claim over a line.
- Too thin: nothing is stored at all, and you are told why.

If a source disagrees with the value, say so with the "contradiction" kind. A disputed claim is held unresolved rather than averaged out.`;

/**
 * Register the evidence-ledger tools. Called from the MCP route's server
 * initializer.
 */
export function registerFactsTools(server: McpServer, ctx: FactsToolContext): void {
  server.tool(
    "record_fact",
    RECORD_FACT_DESCRIPTION,
    {
      contactId: z.string().optional().describe("The contact this is about (or set entityId)"),
      entityId: z.string().optional().describe("The company this is about (or set contactId)"),
      field: z
        .string()
        .max(60)
        .describe(
          "Contacts: name, email, phone, company, title, website, linkedin, facebook, instagram, twitter, location. Companies: name, domain, website, phone, industry, location, description, size.",
        ),
      value: z.string().max(2000).describe("The value you observed"),
      evidence: z.array(evidenceEntry).min(1).max(20).describe("One entry per independent source"),
      method: z
        .string()
        .max(100)
        .describe("How you found it, e.g. linkedin-lookup, bouncer, companies-house, site-crawl"),
      sourceUrl: z.string().max(1000).optional().describe("The main URL behind this fact"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ contactId, entityId, field, value, evidence, method, sourceUrl }, extra) =>
      ctx.gated(extra, "record_fact", 240, (userId) => {
        // Both or neither: refuse rather than guess which record was meant.
        // Attaching a fact to the wrong record is the one unrecoverable
        // failure here (see AGENTS.md).
        const recordId = contactId ?? entityId;
        if (!recordId || (contactId && entityId)) {
          throw new OpError("Set exactly one of contactId or entityId", 400);
        }
        return recordFact(userId, {
          recordType: contactId ? "CONTACT" : "ENTITY",
          recordId,
          field,
          value,
          evidence,
          method,
          sourceUrl: sourceUrl ?? null,
        });
      }),
  );

  server.tool(
    "list_proposed_facts",
    "List facts waiting on a human decision: what was observed, what is on the record now, the evidence behind each, and why it did not apply itself. Read-only and free. You cannot apply or dismiss these; a person settles them in the app.",
    {
      recordType: z.enum(["CONTACT", "ENTITY"]).optional().describe("Filter to one record type"),
      recordId: z.string().optional().describe("Filter to one contact or company"),
      limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 50)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ recordType, recordId, limit }, extra) =>
      ctx.run(() =>
        listProposedFacts(ctx.userIdFrom(extra), { recordType, recordId, limit }),
      ),
  );

  server.tool(
    "get_fact_evidence",
    "Get one recorded fact with its evidence spelled out and the plain-English rationale for its score and band. Use it to see why a claim landed where it did before deciding whether more evidence is worth gathering. Read-only and free.",
    { id: z.string().describe("The fact id returned by record_fact or list_proposed_facts") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ id }, extra) => ctx.run(() => getFactEvidence(ctx.userIdFrom(extra), id)),
  );
}
