// Function tools the agent can call while the person is still on the line.
//
// The set is deliberately small and read mostly. Every tool call costs the
// caller a pause in the conversation, and a voice agent with a big toolbox
// spends the call rummaging in it. Two reads, one log of what happened, and
// one scheduled follow up covers everything a call actually needs.
//
// The one tool that writes a durable record beyond the call log, scheduling a
// follow up, requires an explicit spoken yes first. A model that books a
// meeting because the person said "sure, sounds good" while being polite has
// created an obligation nobody agreed to.

import { llm } from "@livekit/agents";
import { z } from "zod";
import type { CallState } from "./lifecycle.js";
import type { InternalApiClient, Logger } from "./tenant.js";

export interface ToolDeps {
  api: InternalApiClient;
  state: CallState;
  /** Held separately from state.tenantId because tools only ever run once a tenant is resolved. */
  tenantId: string;
  logger: Logger;
  /** The number on the other end of the line, used when no contact id was supplied. */
  peerPhoneNumber: string | null;
  /** Contact resolved at call start, if any. Tools update it when a lookup finds a better match. */
  currentContactId: string | null;
}

const MAX_HISTORY_ITEMS = 8;
/** A follow up further out than this is almost always a hallucinated date. */
const MAX_FOLLOW_UP_DAYS = 180;

// The parameter schemas are named so each execute callback can be annotated
// explicitly. Relying on inference through the tool helper leaves the
// arguments implicitly any under noImplicitAny, which is exactly the place a
// silent contract drift between the model and the API would hide.
const lookupContactParams = z.object({
  phone: z
    .string()
    .nullish()
    .describe("Optional phone number to look up. Leave empty to use the number on this call."),
});

const recentHistoryParams = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_HISTORY_ITEMS)
    .nullish()
    .describe("How many items to read. Defaults to five."),
});

const logCallOutcomeParams = z.object({
  outcome: z
    .enum([
      "interested",
      "not_interested",
      "callback_requested",
      "wrong_number",
      "do_not_call",
      "left_message",
      "no_decision",
    ])
    .describe("The single best label for how this call ended."),
  summary: z
    .string()
    .min(1)
    .max(1000)
    .describe("One or two sentences of what was actually said. No speculation."),
});

const scheduleFollowUpParams = z.object({
  dueAt: z
    .string()
    .describe("When to follow up, as an ISO 8601 timestamp, for example 2026-08-14T15:00:00Z."),
  reason: z.string().min(1).max(500).describe("Why the follow up exists, in the caller's own terms."),
  callerConfirmed: z
    .boolean()
    .describe("True only if you said the day and time out loud and the caller explicitly agreed."),
});

export function buildTools(deps: ToolDeps) {
  return {
    lookup_contact: llm.tool({
      description:
        "Look up the CRM record for the person on this call. Use it once, early, if you need their name, company or status. Returns nothing if they are not in the CRM, which means you do not know who they are.",
      parameters: lookupContactParams,
      execute: async ({ phone }: z.infer<typeof lookupContactParams>) => {
        try {
          const result = await deps.api.lookupContact({
            tenantId: deps.tenantId,
            contactId: deps.currentContactId,
            phone: phone ?? deps.peerPhoneNumber,
          });
          if (!result.contact) {
            return { found: false, message: "No CRM record matches this caller. Do not guess a name." };
          }
          deps.currentContactId = result.contact.id;
          return { found: true, contact: result.contact };
        } catch (error) {
          deps.logger.warn("lookup_contact failed", { error: describe(error) });
          return { found: false, message: "The lookup failed. Continue without it and do not guess." };
        }
      },
    }),

    recent_history: llm.tool({
      description:
        "Read the most recent recorded activity with this contact: notes, outreach, replies and past calls. Use it only when the person refers to a previous interaction. If it comes back empty, no previous interaction is known to you.",
      parameters: recentHistoryParams,
      execute: async ({ limit }: z.infer<typeof recentHistoryParams>) => {
        if (!deps.currentContactId) {
          return { items: [], message: "There is no contact record to read history from." };
        }
        try {
          const result = await deps.api.recentHistory({
            tenantId: deps.tenantId,
            contactId: deps.currentContactId,
            limit: limit ?? 5,
          });
          if (result.items.length === 0) {
            return { items: [], message: "No recorded history. Do not refer to a previous conversation." };
          }
          return { items: result.items };
        } catch (error) {
          deps.logger.warn("recent_history failed", { error: describe(error) });
          return { items: [], message: "The history read failed. Do not refer to a previous conversation." };
        }
      },
    }),

    log_call_outcome: llm.tool({
      description:
        "Record what actually happened on this call, in one or two factual sentences. Call this once, near the end. Record what was said, not what you hoped would be said.",
      parameters: logCallOutcomeParams,
      execute: async ({ outcome, summary }: z.infer<typeof logCallOutcomeParams>) => {
        try {
          await deps.api.logOutcome({
            tenantId: deps.tenantId,
            callId: deps.state.callId,
            roomName: deps.state.roomName,
            contactId: deps.currentContactId,
            outcome,
            summary,
          });
          return { ok: true };
        } catch (error) {
          // The shutdown callback persists the full transcript regardless, so a
          // failure here loses a label, not the record of the call.
          deps.logger.warn("log_call_outcome failed", { error: describe(error) });
          return { ok: false, message: "Could not log the outcome. Do not mention this to the caller." };
        }
      },
    }),

    schedule_follow_up: llm.tool({
      description:
        "Schedule a follow up with this contact. This creates a real, durable task that a person will act on. You must first say the day and time out loud and receive an explicit yes from the caller. Never call this on your own initiative.",
      parameters: scheduleFollowUpParams,
      execute: async ({ dueAt, reason, callerConfirmed }: z.infer<typeof scheduleFollowUpParams>) => {
        if (!callerConfirmed) {
          return {
            ok: false,
            message:
              "Not scheduled. Say the day and time out loud, get an explicit yes, then call this again.",
          };
        }
        if (!deps.currentContactId) {
          return { ok: false, message: "There is no contact record to attach a follow up to." };
        }

        const when = new Date(dueAt);
        if (Number.isNaN(when.getTime())) {
          return { ok: false, message: "That date could not be read. Ask the caller to restate it." };
        }
        const horizonMs = MAX_FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000;
        if (when.getTime() <= Date.now() || when.getTime() - Date.now() > horizonMs) {
          return {
            ok: false,
            message: "That date is in the past or too far out. Confirm the date with the caller again.",
          };
        }

        try {
          const result = await deps.api.scheduleFollowUp({
            tenantId: deps.tenantId,
            callId: deps.state.callId,
            roomName: deps.state.roomName,
            contactId: deps.currentContactId,
            dueAt: when.toISOString(),
            reason,
          });
          return { ok: result.ok, taskId: result.taskId };
        } catch (error) {
          deps.logger.warn("schedule_follow_up failed", { error: describe(error) });
          return {
            ok: false,
            message:
              "The follow up could not be saved. Tell the caller a person will be in touch, and do not claim it is booked.",
          };
        }
      },
    }),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
