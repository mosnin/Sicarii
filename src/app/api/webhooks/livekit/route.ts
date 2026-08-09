// POST /api/webhooks/livekit - LiveKit's server webhook.
//
// AUTH: WebhookReceiver.receive() verifies the Authorization header against our
// API secret AND checks the body hash, so a forged or replayed-with-edits event
// is rejected before a single row is touched. Nothing in the payload is trusted
// for identity until that passes.
//
// RUNTIME: nodejs. Signature verification needs node crypto.
//
// IDEMPOTENT: LiveKit delivers at least once. Every event is claimed in the
// ProcessedEvent table (id = "livekit:<event id>") before it is applied, so a
// redelivery cannot double-bill a call. The claim is the FIRST write; if it
// collides we return 200 immediately and do nothing.
//
// BILLING happens on room_finished and nowhere else, because that event carries
// the authoritative end of the call. A call that was never answered is never
// billed: no setup fee, no minutes, creditsCharged 0. That rule is the whole
// reason answeredAt is stamped separately, on the SIP participant joining.
//
// PUBLIC ROUTE: covered by the existing "/api/webhooks(.*)" matcher in
// src/proxy.ts, so no middleware change is needed.

import { NextRequest, NextResponse } from "next/server";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS, spendCredits } from "@/lib/credits";
import { getWebhookReceiver, isLiveKitConfigured, type WebhookEvent } from "@/lib/livekit";
import { billingDecision, MAX_BILLABLE_MINUTES } from "@/lib/voice-billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json({ error: "LiveKit is not configured" }, { status: 501 });
  }

  const body = await req.text();
  const authHeader = req.headers.get("authorization") ?? undefined;

  let event: WebhookEvent;
  try {
    event = await getWebhookReceiver().receive(body, authHeader);
  } catch (e) {
    console.warn("[livekit-webhook] rejected: signature verification failed", e);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Claim the event before applying it. This is the dedupe.
  const claimId = `livekit:${event.id || `${event.event}:${event.room?.sid ?? "-"}:${event.createdAt ?? 0}`}`;
  try {
    await prisma.processedEvent.create({ data: { id: claimId } });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ ok: true, duplicate: true });
    console.error("[livekit-webhook] could not claim event", e);
    // Fail closed: a 500 makes LiveKit retry, which is safe because the claim
    // is what makes retries idempotent in the first place.
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  try {
    switch (event.event) {
      case "room_started":
        await onRoomStarted(event);
        break;
      case "participant_joined":
        await onParticipantJoined(event);
        break;
      case "room_finished":
        await onRoomFinished(event);
        break;
      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[livekit-webhook] handler failed for ${event.event}`, e);
    // The claim row stays, so LiveKit's retry will be treated as a duplicate.
    // That is the right trade: we would rather drop one event than bill twice.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

/* -------------------------------- handlers -------------------------------- */

async function onRoomStarted(event: WebhookEvent): Promise<void> {
  const roomName = event.room?.name;
  if (!roomName) return;
  await prisma.voiceCall.updateMany({
    where: { livekitRoomName: roomName, status: "QUEUED" },
    data: { status: "RINGING", startedAt: toDate(event.createdAt) ?? new Date() },
  });
}

/** The moment a call is really answered: the SIP participant (the human's leg)
 *  joins the room. The agent participant joining proves nothing, so we look at
 *  the participant KIND rather than at "someone showed up". */
async function onParticipantJoined(event: WebhookEvent): Promise<void> {
  const roomName = event.room?.name;
  if (!roomName || event.participant?.kind !== ParticipantInfo_Kind.SIP) return;
  await prisma.voiceCall.updateMany({
    where: { livekitRoomName: roomName, answeredAt: null },
    data: { status: "ANSWERED", answeredAt: toDate(event.createdAt) ?? new Date() },
  });
}

async function onRoomFinished(event: WebhookEvent): Promise<void> {
  const roomName = event.room?.name;
  if (!roomName) return;

  const call = await prisma.voiceCall.findUnique({ where: { livekitRoomName: roomName } });
  // A room we have no call row for is not ours to bill (an inbound call the
  // worker has not registered yet, or another product on the same project).
  if (!call) return;

  const endedAt = toDate(event.createdAt) ?? new Date();
  const decision = billingDecision(call, endedAt);

  // Settle on billed-state, not on endedAt. The worker's completeCall writes
  // endedAt (transcript, status, timings) but never touches creditsCharged, so
  // an earlier gate on endedAt suppressed billing on every worker-first
  // completion - a deterministic zero-charge. billingDecision gates on
  // creditsCharged instead; see src/lib/voice-billing.ts.
  if (decision.kind === "skip") return;

  if (decision.kind === "unanswered") {
    // No setup fee, no minutes, no credits, but creditsCharged is stamped to 0
    // so the call reads as settled and a later delivery cannot re-open it.
    await prisma.voiceCall.update({
      where: { id: call.id },
      data: { status: decision.status, endedAt, durationSeconds: 0, creditsCharged: 0 },
    });
    return;
  }

  if (decision.capped) {
    console.warn(
      `[livekit-webhook] call ${call.id} ran ${decision.talkSeconds}s, capping billing at ${MAX_BILLABLE_MINUTES}m`,
    );
  }

  const charged = await meter(call.userId, call.id, decision.minutes);

  await prisma.voiceCall.update({
    where: { id: call.id },
    data: {
      status: "COMPLETED",
      endedAt,
      durationSeconds: decision.talkSeconds,
      creditsCharged: charged,
    },
  });
}

/**
 * Charge setup plus one unit per started minute.
 *
 * Each unit is a separate, idempotently-referenced spendCredits call so a
 * partially applied charge is never double applied and the ledger reads as the
 * real breakdown. That makes this O(minutes) round trips, which is the price of
 * not reimplementing the atomic decrement here; a spendCreditsForCount() in
 * src/lib/credits.ts (owned elsewhere) would collapse it to one.
 *
 * Running out of credits mid-call stops the metering rather than failing the
 * webhook: the call already happened, and we would rather under-bill than lose
 * the record of it.
 */
async function meter(userId: string, callId: string, minutes: number): Promise<number> {
  let charged = 0;
  try {
    await spendCredits(userId, "call_setup", { ref: `call:${callId}:setup` });
    charged += CREDIT_COSTS.call_setup;
    for (let i = 0; i < minutes; i++) {
      await spendCredits(userId, "call_minute", { ref: `call:${callId}:minute:${i}` });
      charged += CREDIT_COSTS.call_minute;
    }
  } catch (e) {
    console.warn(`[livekit-webhook] metering stopped early for call ${callId} at ${charged} credits`, e);
  }
  return charged;
}

/* -------------------------------- helpers -------------------------------- */

/** WebhookEvent.createdAt is an int64 of UNIX seconds, so protobuf-es hands it
 *  over as a bigint. */
function toDate(createdAt: bigint | number | undefined): Date | null {
  if (createdAt === undefined || createdAt === null) return null;
  const seconds = typeof createdAt === "bigint" ? Number(createdAt) : createdAt;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
