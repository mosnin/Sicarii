import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getComposio, providerForTriggerSlug, providerForToolkit } from "@/lib/composio";
import { markConnectionUnhealthy, markTriggerFired } from "@/lib/connections";
import { MAILBOX_INGEST_KIND, CALENDAR_INGEST_KIND } from "@/lib/mailbox-ingest";

// The single multi-tenant Composio endpoint.
//
// ONE webhook subscription exists per PROJECT, so every tenant's Gmail and
// Calendar events arrive here, at one URL, interleaved. Four things therefore
// have to be true of this handler and are the reason it looks the way it does:
//
//   VERIFY FIRST. `triggers.parse` is handed the Request object itself. Do NOT
//   call request.text() first and do NOT let any body parser touch it: the
//   signature is computed over the raw bytes, and consuming the stream once
//   means the signature can never verify again. /api/webhooks(.*) is public in
//   src/proxy.ts; this signature is the only authentication there is.
//
//   DEDUPE ON webhook-id. Delivery is AT-LEAST-ONCE and any non-2xx is
//   retried, so the same event WILL arrive twice. The header is stable across
//   retries and equals the payload id.
//
//   RESOLVE THE TENANT BY CONNECTED ACCOUNT. `metadata.user_id` is NULLABLE.
//   Every resolution path below ends at a ConnectedAccount row we own, so a
//   user_id we cannot corroborate is never trusted on its own.
//
//   RETURN IN MILLISECONDS. Absolutely no Gmail fetching inline. A cold start
//   plus one provider fetch exceeds the serverless limit, the delivery is
//   marked failed, and Composio redelivers, which is how a slow handler turns
//   one event into an infinite retry storm. All this does is write a
//   well-formed AgentTask row; the dispatcher runs the real work.

export const runtime = "nodejs";

// Asserted at module load. An empty-but-present verifySecret THROWS inside the
// SDK with a confusing error, and omitting it would silently parse an
// UNVERIFIED webhook, so a missing secret must fail closed and loudly.
const WEBHOOK_SECRET = process.env.COMPOSIO_WEBHOOK_SECRET?.trim() || null;
if (!WEBHOOK_SECRET) {
  console.error("[composio] COMPOSIO_WEBHOOK_SECRET is not set; the webhook will refuse every delivery.");
}

/** Trigger events we act on. Everything else is acknowledged and dropped. */
const TRIGGER_EVENT_TYPES = new Set(["composio.trigger.message", "trigger.message"]);

/** V3-only lifecycle events. These are the ONLY way we ever learn that a
 *  tenant's sync has silently died: a polling trigger that stops polling
 *  produces no events, and "no events" is indistinguishable from a quiet week
 *  unless somebody tells us. */
const TRIGGER_DISABLED_TYPE = "composio.trigger.disabled";
const ACCOUNT_EXPIRED_TYPE = "composio.connected_account.expired";

type Dict = Record<string, unknown>;

function obj(v: unknown): Dict | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A stable uuid derived from the webhook id, used as the AgentTask primary
 *  key. That makes the enqueue itself exactly-once at the database level: two
 *  concurrent deliveries of the same event race on the same primary key and
 *  the loser gets P2002, which closes the window a check-then-insert against
 *  ProcessedEvent would leave open. */
function taskIdFor(webhookId: string): string {
  const hex = createHash("sha256").update(`composio:${webhookId}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Resolve which tenant an event belongs to.
 *
 * `metadata.connected_account_id` is tried first because it is authoritative:
 * ConnectedAccount.composioConnectionId is indexed for exactly this lookup and
 * a hit proves the account is one of ours. `metadata.user_id` is only ever a
 * fallback, and even then it must land on a ConnectedAccount row we hold, so
 * user_id is never trusted alone.
 */
async function resolveConnection(metadata: Dict, triggerSlug: string | null, toolkitSlug: string | null) {
  const composioConnectionId = str(metadata.connected_account_id) ?? str(metadata.connectedAccountId);
  if (composioConnectionId) {
    const row = await prisma.connectedAccount.findFirst({ where: { composioConnectionId } });
    if (row) return row;
  }

  const composioUserId = str(metadata.user_id) ?? str(metadata.userId);
  if (composioUserId) {
    const provider = providerForTriggerSlug(triggerSlug) ?? providerForToolkit(toolkitSlug);
    const row = await prisma.connectedAccount.findFirst({
      where: { composioUserId, ...(provider ? { provider } : {}) },
      orderBy: { createdAt: "desc" },
    });
    if (row) return row;
  }
  return null;
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Read headers before touching the body; header access never consumes the
  // stream, and we need the id even if verification fails.
  const webhookId = req.headers.get("webhook-id");
  const attempt = req.headers.get("x-composio-delivery-attempt");

  let raw: Dict;
  try {
    // The Request object goes in whole and unread. See the note at the top.
    const result = await getComposio().triggers.parse(req, { verifySecret: WEBHOOK_SECRET });
    raw = (obj(result.rawPayload) ?? {}) as Dict;
  } catch (e) {
    console.warn("[composio] webhook verification failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // The header is authoritative (stable across retries); the payload id is the
  // documented equivalent and covers a delivery that somehow omits the header.
  const eventId = webhookId ?? str(raw.id);
  if (!eventId) {
    return NextResponse.json({ error: "Missing webhook id" }, { status: 400 });
  }

  try {
    const seen = await prisma.processedEvent.findUnique({ where: { id: eventId }, select: { id: true } });
    if (seen) return NextResponse.json({ received: true, duplicate: true });

    const type = str(raw.type) ?? "";
    const metadata = obj(raw.metadata) ?? {};
    const data = obj(raw.data) ?? {};
    const triggerSlug = str(metadata.trigger_slug) ?? str(metadata.triggerSlug) ?? str(data.trigger_slug);
    const toolkitSlug = str(metadata.toolkit_slug) ?? str(data.toolkit_slug);

    const connection = await resolveConnection(metadata, triggerSlug, toolkitSlug);
    if (!connection) {
      // Not ours, or ours and already deleted. Acknowledge so Composio stops
      // retrying forever; an unresolvable event is not a transient fault.
      console.warn("[composio] unresolvable tenant for event", eventId, type, triggerSlug);
      await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
      return NextResponse.json({ received: true, unmatched: true });
    }

    // ── Sync health ────────────────────────────────────────────────────────
    if (type === TRIGGER_DISABLED_TYPE) {
      const reason = str(data.disabled_reason) ?? str(data.reason) ?? "unknown";
      await markConnectionUnhealthy(connection.id, `Sync stopped: ${reason}`, {
        slug: triggerSlug,
        expired: reason === "connection_expired",
      });
      await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
      return NextResponse.json({ received: true, handled: "trigger.disabled" });
    }

    if (type === ACCOUNT_EXPIRED_TYPE) {
      await markConnectionUnhealthy(connection.id, "Connection expired, reconnect required", {
        expired: true,
      });
      await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
      return NextResponse.json({ received: true, handled: "connected_account.expired" });
    }

    if (!TRIGGER_EVENT_TYPES.has(type)) {
      await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
      return NextResponse.json({ received: true, ignored: type });
    }

    // ── Enqueue ────────────────────────────────────────────────────────────
    const provider = providerForTriggerSlug(triggerSlug) ?? providerForToolkit(toolkitSlug);
    if (!provider) {
      await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
      return NextResponse.json({ received: true, ignored: triggerSlug ?? "unknown trigger" });
    }

    const kind = provider === "GMAIL" ? MAILBOX_INGEST_KIND : CALENDAR_INGEST_KIND;
    const reason =
      provider === "GMAIL"
        ? "New mail arrived in the connected mailbox: file it against the right contact and detect replies."
        : "A calendar event changed in the connected calendar: file the meeting and its attendees.";

    try {
      await prisma.agentTask.create({
        data: {
          id: taskIdFor(eventId),
          userId: connection.userId,
          kind,
          reason,
          dueAt: new Date(),
          // Ahead of routine background work: a reply sitting unprocessed is
          // the agent chasing somebody who already answered.
          priority: 5,
          payload: {
            source: "composio",
            webhookId: eventId,
            triggerSlug: triggerSlug ?? "",
            toolkitSlug,
            provider,
            connectionId: connection.id,
            composioConnectionId: connection.composioConnectionId,
            receivedAt: new Date().toISOString(),
            deliveryAttempt: attempt ?? null,
            data,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // A concurrent delivery of the same event already queued it.
      await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Best effort, never blocks the ack.
    if (triggerSlug) await markTriggerFired(connection.id, triggerSlug, new Date()).catch(() => {});

    // Marked processed only AFTER the row is committed, matching the Stripe
    // handler: marking first would ack a retry as a duplicate and lose the
    // event outright on a transient database error.
    await prisma.processedEvent.create({ data: { id: eventId } }).catch(() => {});
    return NextResponse.json({ received: true, queued: kind });
  } catch (e) {
    // A non-2xx makes Composio retry, which is right: nothing was marked
    // processed, and the deterministic task id makes the retry safe.
    console.error("[composio] webhook processing failed", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
