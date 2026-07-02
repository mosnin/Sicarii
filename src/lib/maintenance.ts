// Bounded, best-effort cleanup for the two append-only idempotency tables that
// would otherwise grow forever: processed_events (Stripe event ids) and
// idempotency_keys (credit-grant refs). Rows older than the retention window
// can never match a live webhook retry (Stripe retries for at most a few days;
// a payment ref is single-use on-chain), so deleting them is safe.
//
// Called opportunistically from the Stripe webhook, sampled so it runs on a
// fraction of deliveries (not every one) and capped so a single delete never
// blocks the handler. Fire-and-forget: a failure here never affects the webhook.

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
    } catch (e) {
      console.warn("[maintenance] idempotency cleanup failed", e);
    }
  })();
}
