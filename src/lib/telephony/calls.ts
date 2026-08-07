// Placing and reading calls.
//
// OUTBOUND USES DISPATCH-THEN-DIAL, NOT DIAL-THEN-DISPATCH.
// We create the room, dispatch the agent into it WITH the tenant, the contact
// and the purpose in its job metadata, and let the agent place the SIP call
// itself. Dialing first races the answer: a human can pick up before the agent
// has joined and read the CRM context, and the first thing they hear is silence.
//
// OUTBOUND IS DORMANT TODAY. LiveKit's own number service is inbound only, so a
// LiveKit DID cannot dial out. Outbound needs a carrier's outbound SIP trunk
// registered with LiveKit and named in LIVEKIT_OUTBOUND_TRUNK_ID. Until that
// exists, placeOutboundCall() refuses with an explicit reason, writes nothing,
// and charges nothing. It must never look like it worked.
//
// THREE PRE-FLIGHT CHECKS, ALL IN HERE, NEVER IN THE CALLER:
//   1. suppression: a suppressed destination is never dialed, full stop
//   2. outbound capability: no trunk means no call, said out loud
//   3. credits: checked before the dial, debited only when a call is answered
//      (see the room_finished webhook). A failed dial is never a conversation.

import type { VoiceCall, VoiceCallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { ensureCredits } from "@/lib/credits";
import {
  callOutcomeFromSip,
  dispatchOutboundAgent,
  isLiveKitConfigured,
  newRoomName,
  outboundTrunkId,
  sipFailureFrom,
} from "@/lib/livekit";
import { digitsOf, normalizeE164 } from "@/lib/telephony/provider";

/* ------------------------------- suppression ------------------------------- */

/** Scopes that block an OUTBOUND dial. INBOUND-only suppression does not. */
const OUTBOUND_SCOPES = ["OUTBOUND", "ALL"] as const;

export class SuppressedDestinationError extends OpError {
  constructor(what: string) {
    super(
      `${what} is on your suppression list, so this call was not placed. Remove the suppression first if this is intentional.`,
      403,
    );
    this.name = "SuppressedDestinationError";
  }
}

/**
 * Refuse to dial anything the tenant has suppressed.
 *
 * The suppression list is a DESTINATION list, so we check it three ways:
 *   - the E.164 number itself, and its bare digits, as stored on SuppressedContact
 *   - the contact's email address
 *   - the contact's email domain, on SuppressedDomain
 * Any hit with scope OUTBOUND or ALL blocks the call. Exported so the check is
 * testable on its own, but callers must not rely on calling it themselves:
 * placeOutboundCall() always runs it.
 */
export async function assertNotSuppressed(
  userId: string,
  target: { e164?: string | null; email?: string | null },
): Promise<void> {
  const candidates = new Set<string>();
  if (target.e164) {
    candidates.add(target.e164.toLowerCase());
    const digits = digitsOf(target.e164);
    if (digits) candidates.add(digits);
  }
  const email = target.email?.trim().toLowerCase();
  if (email) candidates.add(email);

  if (candidates.size) {
    const hit = await prisma.suppressedContact.findFirst({
      where: { userId, email: { in: [...candidates] }, scope: { in: [...OUTBOUND_SCOPES] } },
      select: { email: true },
    });
    if (hit) throw new SuppressedDestinationError(hit.email);
  }

  const domain = email?.split("@")[1];
  if (domain) {
    const hit = await prisma.suppressedDomain.findFirst({
      where: { userId, domain, scope: { in: [...OUTBOUND_SCOPES] } },
      select: { domain: true },
    });
    if (hit) throw new SuppressedDestinationError(hit.domain);
  }
}

/* -------------------------------- outbound -------------------------------- */

/** The single honest statement about outbound, used by the API, the MCP tool
 *  description and the UI so all three say the same thing. */
export const OUTBOUND_UNAVAILABLE_REASON =
  "Outbound calling requires an outbound SIP trunk, and LiveKit phone numbers are inbound-only today. " +
  "Inbound calls to your Scalar number work now; outbound stays switched off until a carrier outbound trunk " +
  "is connected (LIVEKIT_OUTBOUND_TRUNK_ID).";

export function isOutboundAvailable(): boolean {
  return isLiveKitConfigured() && Boolean(outboundTrunkId());
}

export interface PlaceCallInput {
  contactId?: string;
  /** Explicit destination, E.164. Overrides the contact's phone. */
  toNumber?: string;
  /** What the agent is calling to accomplish, in plain language. */
  purpose: string;
  /** Which of the tenant's numbers to call from. Defaults to their first active one. */
  fromNumberId?: string;
}

export interface PlacedCall {
  callId: string;
  roomName: string;
  status: VoiceCallStatus;
  toNumber: string;
  fromNumber: string;
  dispatchId: string;
}

export async function placeOutboundCall(userId: string, input: PlaceCallInput): Promise<PlacedCall> {
  if (!userId) throw new OpError("Unauthorized", 401);

  const purpose = input.purpose?.trim();
  if (!purpose) throw new OpError("purpose is required: say what this call is meant to accomplish.", 400);

  // 1. Resolve the destination, ownership-checked.
  const contact = input.contactId
    ? await prisma.contact.findFirst({
        where: { id: input.contactId, userId },
        select: { id: true, name: true, email: true, phone: true, company: true, title: true },
      })
    : null;
  if (input.contactId && !contact) throw new OpError("Contact not found", 404);

  const rawTo = input.toNumber ?? contact?.phone ?? null;
  if (!rawTo) {
    throw new OpError(
      contact ? `${contact.name ?? "That contact"} has no phone number on file.` : "toNumber or contactId is required.",
      400,
    );
  }
  const toNumber = normalizeE164(rawTo);
  if (!toNumber) {
    // Never dial a number we had to guess at. Dialing the wrong human is not
    // recoverable.
    throw new OpError(`"${rawTo}" is not a valid E.164 number (for example +14155551234).`, 400);
  }

  // 2. Suppression. Before anything else that could result in a ring.
  await assertNotSuppressed(userId, { e164: toNumber, email: contact?.email });

  // 3. Outbound capability. Explicit, honest, and free.
  if (!isLiveKitConfigured()) throw new OpError("Voice calling is not configured on this deployment.", 501);
  const trunkId = outboundTrunkId();
  if (!trunkId) throw new OpError(OUTBOUND_UNAVAILABLE_REASON, 501);

  // 4. The number we call FROM.
  const from = input.fromNumberId
    ? await prisma.phoneNumber.findFirst({ where: { id: input.fromNumberId, userId, status: "ACTIVE" } })
    : await prisma.phoneNumber.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!from) {
    throw new OpError(
      input.fromNumberId
        ? "That phone number is not one of yours, or is not active."
        : "You do not have an active phone number yet. Buy one in Settings first.",
      400,
    );
  }

  // 5. Credits. Checked, not spent: an unanswered call is never billed.
  await ensureCredits(userId, "call_setup");

  // 6. The row goes in BEFORE the dispatch, so an in-flight call is never
  // invisible. If the process dies after this line the call still has a record.
  const roomName = newRoomName(userId);
  const call = await prisma.voiceCall.create({
    data: {
      userId,
      phoneNumberId: from.id,
      contactId: contact?.id ?? null,
      direction: "OUTBOUND",
      fromNumber: from.e164,
      toNumber,
      livekitRoomName: roomName,
      status: "QUEUED",
      systemPrompt: purpose,
    },
  });

  // 7. Dispatch, then let the agent dial.
  try {
    const dispatchId = await dispatchOutboundAgent({
      roomName,
      metadata: {
        tenantId: userId,
        callId: call.id,
        direction: "outbound",
        trunkId,
        toNumber,
        fromNumber: from.e164,
        purpose,
        contact: contact
          ? { id: contact.id, name: contact.name, company: contact.company, title: contact.title }
          : null,
      },
    });

    const updated = await prisma.voiceCall.update({
      where: { id: call.id },
      data: { livekitCallId: dispatchId, startedAt: new Date() },
    });

    // Best effort audit trail; never fails the call.
    if (contact) {
      await prisma.activity
        .create({
          data: {
            userId,
            contactId: contact.id,
            kind: "call",
            channel: "phone",
            body: `Outbound call queued to ${toNumber}. Purpose: ${purpose.slice(0, 500)}`,
          },
        })
        .catch((e) => console.warn("[telephony] could not log call activity", e));
    }

    return {
      callId: updated.id,
      roomName,
      status: updated.status,
      toNumber,
      fromNumber: from.e164,
      dispatchId,
    };
  } catch (e) {
    // The dial never happened. Stamp the SIP detail so busy / no-answer /
    // rejected are distinguishable, and leave creditsCharged null: a failed
    // dial is not a conversation and must never be billed as one.
    const failure = sipFailureFrom(e);
    const outcome = callOutcomeFromSip(failure.sipStatusCode);
    await prisma.voiceCall.update({
      where: { id: call.id },
      data: {
        status: outcome === "ANSWERED" ? "FAILED" : (outcome as VoiceCallStatus),
        sipStatusCode: failure.sipStatusCode ?? null,
        sipStatus: failure.sipStatus ?? failure.message.slice(0, 200),
        endedAt: new Date(),
        creditsCharged: 0,
      },
    });
    throw new OpError(
      failure.sipStatusCode
        ? `The call could not be placed (SIP ${failure.sipStatusCode} ${failure.sipStatus ?? ""}).`.trim()
        : `The call could not be placed: ${failure.message}`,
      502,
    );
  }
}

/* --------------------------------- reads --------------------------------- */

export async function getCall(userId: string, callId: string): Promise<VoiceCall> {
  if (!userId) throw new OpError("Unauthorized", 401);
  const call = await prisma.voiceCall.findFirst({ where: { id: callId, userId } });
  if (!call) throw new OpError("Call not found", 404);
  return call;
}

export interface ListCallsInput {
  contactId?: string;
  status?: VoiceCallStatus;
  limit?: number;
}

export async function listCalls(userId: string, input: ListCallsInput = {}): Promise<VoiceCall[]> {
  if (!userId) throw new OpError("Unauthorized", 401);
  const take = Math.min(Math.max(Math.trunc(input.limit ?? 25), 1), 100);
  return prisma.voiceCall.findMany({
    where: {
      userId,
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export interface CallTranscript {
  callId: string;
  status: VoiceCallStatus;
  durationSeconds: number | null;
  transcript: unknown;
  recordingUrl: string | null;
}

export async function getCallTranscript(userId: string, callId: string): Promise<CallTranscript> {
  const call = await getCall(userId, callId);
  return {
    callId: call.id,
    status: call.status,
    durationSeconds: call.durationSeconds,
    // Null until the worker writes it back. Saying so is better than an empty
    // string the agent reads as "they said nothing".
    transcript: call.transcript ?? null,
    recordingUrl: call.recordingUrl,
  };
}
