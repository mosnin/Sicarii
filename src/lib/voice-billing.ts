// Pure billing decision for a finished voice call. Kept out of the webhook
// route so the rule that caused a real revenue bug - "settle on billed-state,
// never on endedAt" - is unit-testable without a Prisma or WebhookReceiver
// harness. The route applies what this returns; it decides nothing itself.

/** Upper bound on billable minutes for one call. A stuck room must not be able
 *  to drain a tenant's balance; anything past this is a bug to investigate, not
 *  a charge to make. */
export const MAX_BILLABLE_MINUTES = 180;

import type { VoiceCallStatus } from "@prisma/client";

export interface CallForBilling {
  /** null = not yet settled, 0 = settled and free (unanswered), >0 = billed.
   *  This, not endedAt, is the settlement sentinel: the worker writes endedAt
   *  when it finishes a call but never touches creditsCharged, so gating on
   *  endedAt suppressed billing on every worker-first completion. */
  creditsCharged: number | null;
  /** When the callee actually answered. null means the call was never
   *  answered, which is billed at zero. */
  answeredAt: Date | null;
  /** Current status, preserved when a specific unanswered outcome is known. */
  status: VoiceCallStatus;
}

export type BillingDecision =
  | { kind: "skip"; reason: "already-settled" }
  | { kind: "unanswered"; status: VoiceCallStatus }
  | { kind: "answered"; talkSeconds: number; minutes: number; capped: boolean };

/**
 * Decide how a room_finished event settles a call.
 *
 * `endedAt` is the authoritative end from the webhook event. Talk time is
 * measured from answer to hangup, not from room creation, because the room
 * exists while the phone rings and nobody should pay for ringing.
 */
export function billingDecision(call: CallForBilling, endedAt: Date): BillingDecision {
  // Settle exactly once. A redelivered webhook, or a webhook arriving after the
  // worker already completed the call, must never re-bill. spendCredits is also
  // idempotent per ref, so this is belt and braces, but it keeps the ledger
  // from reading a second zero-delta settlement.
  if (call.creditsCharged !== null) return { kind: "skip", reason: "already-settled" };

  if (!call.answeredAt) {
    // Keep a specific SIP outcome if the dial recorded one; otherwise the
    // honest default for an unanswered room is NO_ANSWER.
    const specific: VoiceCallStatus[] = ["BUSY", "NO_ANSWER", "FAILED", "VOICEMAIL"];
    return { kind: "unanswered", status: specific.includes(call.status) ? call.status : "NO_ANSWER" };
  }

  const talkSeconds = Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000));
  const uncapped = Math.ceil(talkSeconds / 60);
  const minutes = Math.min(uncapped, MAX_BILLABLE_MINUTES);
  return { kind: "answered", talkSeconds, minutes, capped: uncapped > MAX_BILLABLE_MINUTES };
}
