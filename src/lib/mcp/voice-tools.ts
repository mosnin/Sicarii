// Voice tools for the MCP server.
//
// WHAT IS DELIBERATELY MISSING: buying a number.
// Provisioning a DID spends real recurring money on a telecom asset, under a
// regulatory identity that in many regions must be the END CUSTOMER's. That is
// a human decision, so it lives only behind a Clerk session at
// POST /api/phone-numbers/purchase. An agent can SEARCH numbers (free, read
// only) and LIST the ones the tenant already owns, and that is the line.
//
// Wired in by the coordinator:
//   import { registerVoiceTools } from "@/lib/mcp/voice-tools";
//   registerVoiceTools(server, { userIdFrom, run, gated });

import { z, type ZodRawShape } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OUTBOUND_UNAVAILABLE_REASON, getCall, getCallTranscript, isOutboundAvailable, listCalls, placeOutboundCall } from "@/lib/telephony/calls";
import { listNumbers, searchAvailableNumbers } from "@/lib/telephony/provisioning";
import { CREDIT_COSTS } from "@/lib/credits";

/* ------------------------------- the seam ------------------------------- */

export interface McpToolExtra {
  authInfo?: AuthInfo;
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** The subset of the MCP server we use. Structural so this module never has to
 *  import the server implementation. */
export interface VoiceToolServer {
  tool(
    name: string,
    description: string,
    paramsSchema: ZodRawShape,
    annotations: McpToolAnnotations,
    cb: (args: Record<string, unknown>, extra: McpToolExtra) => Promise<McpToolResult>,
  ): unknown;
}

/** The helpers the MCP route already owns: identity, error shaping, and the
 *  per-user rate limit for paid tools. Passed in rather than re-implemented so
 *  behaviour stays identical to every other tool on the server. */
export interface VoiceToolsContext {
  userIdFrom: (extra: McpToolExtra) => string;
  run: (fn: () => Promise<unknown>) => Promise<McpToolResult>;
  gated: (
    extra: McpToolExtra,
    bucket: string,
    limit: number,
    fn: (userId: string) => Promise<unknown>,
  ) => Promise<McpToolResult>;
}

/* -------------------------------- schemas -------------------------------- */

const searchNumbersSchema = z.object({
  country: z.string().trim().length(2).describe("Two-letter ISO country code. US only today."),
  areaCode: z.string().trim().max(6).optional().describe("Area code, digits only, e.g. 415"),
  contains: z.string().trim().max(20).optional().describe("Digits the number should contain"),
  limit: z.number().int().min(1).max(50).optional(),
});

const placeCallSchema = z.object({
  contactId: z.string().describe("The contact to call. Their phone number is used unless toNumber is set."),
  purpose: z
    .string()
    .min(1)
    .max(4000)
    .describe("What this call is for, in plain language. The agent hears this before the phone rings."),
  toNumber: z.string().max(40).optional().describe("Override destination, E.164 (e.g. +14155551234)"),
  fromNumberId: z.string().max(100).optional().describe("Which of your numbers to call from"),
});

const getCallSchema = z.object({ callId: z.string() });

const listCallsSchema = z.object({
  contactId: z.string().optional(),
  status: z
    .enum(["QUEUED", "RINGING", "ANSWERED", "COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "VOICEMAIL"])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/* ------------------------------ registration ------------------------------ */

export function registerVoiceTools(server: VoiceToolServer, ctx: VoiceToolsContext): void {
  server.tool(
    "search_phone_numbers",
    "Search phone numbers available to buy, with their monthly cost and spam score. Read only and free: this does NOT buy anything. Buying a number spends real recurring money on a telecom asset and is a human decision, so it is only available to the account owner in Settings, never to an agent. Use this to show the operator what is available. US only today.",
    searchNumbersSchema.shape,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args, extra) => {
      const a = searchNumbersSchema.parse(args);
      return ctx.gated(extra, "search_phone_numbers", 30, async (userId) => {
        const result = await searchAvailableNumbers(userId, {
          countryCode: a.country,
          areaCode: a.areaCode,
          contains: a.contains,
          limit: a.limit,
        });
        return {
          ...result,
          note: "Buying is not available to agents. Ask the account owner to buy one in Settings.",
        };
      });
    },
  );

  server.tool(
    "list_my_numbers",
    "List the phone numbers this account owns, with their status and whether each one is wired to receive calls. A number with no dispatch rule will not ring.",
    z.object({}).shape,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (_args, extra) =>
      ctx.run(async () => {
        const numbers = await listNumbers(ctx.userIdFrom(extra));
        return {
          numbers: numbers.map((n) => ({
            id: n.id,
            e164: n.e164,
            countryCode: n.countryCode,
            status: n.status,
            provider: n.provider,
            wiredForInbound: Boolean(n.livekitDispatchRuleId),
            monthlyCostCents: n.monthlyCostCents,
            spamScore: n.spamScore,
            lastError: n.lastError,
          })),
          outboundAvailable: isOutboundAvailable(),
          ...(isOutboundAvailable() ? {} : { outboundUnavailableReason: OUTBOUND_UNAVAILABLE_REASON }),
        };
      }),
  );

  server.tool(
    "place_call",
    "PLACE A REAL PHONE CALL TO A REAL HUMAN. A voice agent dials the contact and talks to whoever answers, so only use this when the operator has asked for a call. " +
      `It costs credits (${CREDIT_COSTS.call_setup} to set up plus ${CREDIT_COSTS.call_minute} per minute of conversation; an unanswered call is not charged). ` +
      "The destination is checked against this account's suppression list first and a suppressed number is never dialed. " +
      "LIMITATION YOU MUST PLAN AROUND: outbound calling is currently switched off. LiveKit phone numbers are inbound-only today, so until an outbound carrier trunk is connected this tool returns a 501 and places no call. Inbound calls to the account's number do work. Do not build a plan that depends on outbound dialing without checking list_my_numbers.outboundAvailable first.",
    placeCallSchema.shape,
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    async (args, extra) => {
      const a = placeCallSchema.parse(args);
      return ctx.gated(extra, "place_call", 20, (userId) => placeOutboundCall(userId, a));
    },
  );

  server.tool(
    "get_call",
    "Get one call: status, direction, numbers, duration, SIP outcome (busy, no answer, rejected) and credits charged.",
    getCallSchema.shape,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args, extra) => {
      const a = getCallSchema.parse(args);
      return ctx.run(() => getCall(ctx.userIdFrom(extra), a.callId));
    },
  );

  server.tool(
    "list_calls",
    "List calls for this account, newest first. Filter by contactId or status.",
    listCallsSchema.shape,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args, extra) => {
      const a = listCallsSchema.parse(args);
      return ctx.run(() => listCalls(ctx.userIdFrom(extra), a));
    },
  );

  server.tool(
    "get_call_transcript",
    "Get the transcript and recording of a call. Returns null for a call that has not finished or was never answered, rather than an empty transcript you might read as silence.",
    getCallSchema.shape,
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args, extra) => {
      const a = getCallSchema.parse(args);
      return ctx.run(() => getCallTranscript(ctx.userIdFrom(extra), a.callId));
    },
  );
}

/** The tool names this module registers. Exported so the coordinator can check
 *  for collisions with the legacy AgentPhone tools before wiring it in. */
export const VOICE_TOOL_NAMES = [
  "search_phone_numbers",
  "list_my_numbers",
  "place_call",
  "get_call",
  "list_calls",
  "get_call_transcript",
] as const;
