// Bounded, best-effort cleanup for the two append-only idempotency tables that
// would otherwise grow forever: processed_events (Stripe event ids) and
// idempotency_keys (credit-grant refs). Rows older than the retention window
// can never match a live webhook retry (Stripe retries for at most a few days;
// a payment ref is single-use on-chain), so deleting them is safe.
//
// Called opportunistically from the Stripe webhook, sampled so it runs on a
// fraction of deliveries (not every one) and capped so a single delete never
// blocks the handler. Fire-and-forget: a failure here never affects the webhook.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const RETENTION_DAYS = 60;
const DELETE_CAP = 500;

/**
 * Delete idempotency rows older than the retention window, capped. Runs at most
 * `sampleOneIn`-fraction of the time so it does not add a query to every call.
 * Deterministic sampling on the provided key avoids RNG.
 */
export function maybeCleanupIdempotency(sampleKey: string, sampleOneIn = 16): void {
  // Cheap deterministic sample: last hex nibble of the key. ~1/16 by default.
  const nibble = parseInt(sampleKey.slice(-1), 16);
  if (Number.isNaN(nibble) || nibble % sampleOneIn !== 0) return;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Fire-and-forget; never await into the request path, never throw.
  void (async () => {
    try {
      const oldEvents = await prisma.processedEvent.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: DELETE_CAP,
      });
      if (oldEvents.length > 0) {
        await prisma.processedEvent.deleteMany({
          where: { id: { in: oldEvents.map((e) => e.id) } },
        });
      }
      const oldKeys = await prisma.idempotencyKey.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { key: true },
        take: DELETE_CAP,
      });
      if (oldKeys.length > 0) {
        await prisma.idempotencyKey.deleteMany({
          where: { key: { in: oldKeys.map((k) => k.key) } },
        });
      }
      // Revoked OAuth tokens past their original expiry are already rejected by
      // the JWT exp check, so the revocation row is no longer needed.
      const now = new Date();
      const deadTokens = await prisma.revokedToken.findMany({
        where: { expiresAt: { lt: now } },
        select: { jti: true },
        take: DELETE_CAP,
      });
      if (deadTokens.length > 0) {
        await prisma.revokedToken.deleteMany({
          where: { jti: { in: deadTokens.map((t) => t.jti) } },
        });
      }
    } catch (e) {
      console.warn("[maintenance] idempotency cleanup failed", e);
    }
  })();
}

/**
 * Delete a tenant and ALL of its data, atomically. The one place account
 * deletion lives, so the user.deleted and organization.deleted webhook paths
 * cannot drift.
 *
 * Most tables cascade from the User FK. Three do not, and each is a real
 * retention bug if missed:
 *   - Pipeline / Segment carry a scalar userId with no FK cascade.
 *   - FieldProvenance has NO userId at all (it is keyed by recordType+recordId),
 *     so its valueSnapshot copies of a person's data outlive the contact unless
 *     deleted explicitly. We gather the tenant's record ids BEFORE the delete,
 *     because once the contacts and entities cascade away the ids are gone.
 *
 * Fails loudly (throws) rather than swallowing a partial delete: a compliance
 * action that reports success while retaining data is worse than a retry.
 */
export async function purgeTenant(userId: string): Promise<void> {
  // Revoke external resources FIRST, best-effort. These are network calls to
  // Composio and LiveKit, so they run outside (and before) the atomic DB delete:
  // a revocation failure must never block the data deletion, which is the actual
  // compliance obligation. A leaked external resource is a cost to clean up, not
  // a retained-data violation, so we log and proceed. Importing lazily keeps a
  // heavy provider graph out of the webhook's hot path when there is nothing to
  // revoke.
  await revokeExternalResources(userId).catch((e) => console.error(`[purge] external revocation for ${userId}`, e));

  const [contacts, entities] = await Promise.all([
    prisma.contact.findMany({ where: { userId }, select: { id: true } }),
    prisma.entity.findMany({ where: { userId }, select: { id: true } }),
  ]);
  const recordIds = [...contacts.map((c) => c.id), ...entities.map((e) => e.id)];

  await prisma.$transaction([
    ...(recordIds.length ? [prisma.fieldProvenance.deleteMany({ where: { recordId: { in: recordIds } } })] : []),
    prisma.pipeline.deleteMany({ where: { userId } }),
    prisma.segment.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

/**
 * Best-effort teardown of a tenant's resources at third parties, before their
 * rows are deleted. Each is independent and swallows its own failure: one dead
 * provider must not strand the rest, and none may block the DB delete.
 *   - Composio connected accounts (mailbox/calendar OAuth + their triggers)
 *   - LiveKit phone numbers (release the DID + its dispatch rule/trunk)
 * Dynamic imports so the provider clients are only loaded when there is
 * actually something to revoke.
 */
export async function revokeExternalResources(userId: string): Promise<void> {
  const [connections, numbers] = await Promise.all([
    prisma.connectedAccount.findMany({ where: { userId }, select: { id: true } }),
    prisma.phoneNumber.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true } }),
  ]);

  if (connections.length) {
    const { disconnectConnection } = await import("@/lib/connections");
    for (const c of connections) {
      await disconnectConnection(userId, c.id).catch((e) => console.error(`[purge] disconnect ${c.id}`, e));
    }
  }
  if (numbers.length) {
    const { releaseNumber } = await import("@/lib/telephony/provisioning");
    for (const n of numbers) {
      await releaseNumber(userId, n.id).catch((e) => console.error(`[purge] release number ${n.id}`, e));
    }
  }
}

/**
 * Voice-recording retention. Call recordings, transcripts, the per-call system
 * prompt, and model-usage detail are sensitive and have no reason to live
 * forever. This clears them from calls older than the retention window (default
 * 90 days, VOICE_RETENTION_DAYS), keeping the call's billing-relevant metadata
 * (duration, status, timestamps) but dropping its content. Idempotent and
 * bounded; run from the periodic dispatch pass.
 */
export async function redactOldVoiceCalls(now: Date = new Date()): Promise<number> {
  const days = Number(process.env.VOICE_RETENTION_DAYS);
  const window = Number.isFinite(days) && days > 0 ? Math.trunc(days) : 90;
  const cutoff = new Date(now.getTime() - window * 24 * 60 * 60 * 1000);
  const { count } = await prisma.voiceCall.updateMany({
    where: {
      endedAt: { lt: cutoff },
      // Only rows that still hold content, so the sweep is a no-op once caught up.
      OR: [{ transcript: { not: Prisma.DbNull } }, { recordingUrl: { not: null } }, { systemPrompt: { not: null } }],
    },
    data: { transcript: Prisma.DbNull, recordingUrl: null, systemPrompt: null, modelUsage: Prisma.DbNull },
  });
  return count;
}
