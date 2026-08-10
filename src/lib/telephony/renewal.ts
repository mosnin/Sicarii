// Monthly rent for phone numbers. A number costs the carrier every month, so
// charging once at purchase was a straight revenue leak. This seeds a renewal
// task per due number onto the leased queue and charges the monthly cost in
// credits (1 credit = 1 cent, so monthlyCostCents maps directly).
//
// On a successful charge the next renewal is 30 days out. On insufficient
// credits the charge is NOT forced: the number enters a short grace window and
// retries, because releasing a working number for one missed cycle is a worse
// outcome than a few days of unpaid rent. Sustained non-payment past the grace
// window is a release decision left to a founder policy (marked below), not an
// automatic teardown.

import { prisma } from "@/lib/prisma";
import { enqueueTask } from "@/lib/tasks";
import { spendCreditsAmount } from "@/lib/credits";

export const PHONE_RENEWAL_KIND = "phone_number_renewal";

const RENEWAL_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const SEED_LIMIT = 200;

/** Queue a renewal task for every ACTIVE number whose rent is due. */
export async function seedDueRenewals(now: Date = new Date()): Promise<number> {
  const due = await prisma.phoneNumber.findMany({
    where: { status: "ACTIVE", nextRenewalAt: { lte: now }, monthlyCostCents: { gt: 0 } },
    orderBy: { nextRenewalAt: "asc" },
    take: SEED_LIMIT,
    select: { id: true, userId: true, e164: true },
  });
  let seeded = 0;
  for (const n of due) {
    const res = await enqueueTask(n.userId, {
      kind: PHONE_RENEWAL_KIND,
      reason: `Monthly rent for ${n.e164} is due.`,
      dueAt: now,
      ref: n.id,
      // A number is charged at most once per due date; the dedupe guard plus the
      // nextRenewalAt advance keep a redelivery from double-charging.
      cooldownMs: GRACE_MS,
    }).catch((e) => {
      console.error("[renewal] seed", n.id, e);
      return null;
    });
    if (res && !res.deduped) seeded++;
  }
  return seeded;
}

/**
 * Charge one number's monthly rent, EXACTLY once per cycle.
 *
 * The charge and the date-advance were previously two writes: a crash between
 * them left finishedAt null, the task retried, and the number was charged
 * twice. And two concurrent dispatchers could both pass a check-then-act guard.
 * Both holes are closed by CLAIMING the renewal first: a single conditional
 * updateMany advances nextRenewalAt only if it is still due, which atomically
 * hands the cycle to exactly one caller (a redelivery or a concurrent dispatcher
 * finds count === 0 and stops). Only the claimer then charges. If the process
 * dies after claiming but before charging, we UNDER-bill by one cycle - the safe
 * direction with money - rather than double-charge.
 */
export async function handleNumberRenewal(numberId: string): Promise<{ outcome: string }> {
  const now = new Date();
  const num = await prisma.phoneNumber.findUnique({ where: { id: numberId } });
  if (!num || num.status !== "ACTIVE") return { outcome: "Number is not active; no rent charged." };
  if (!num.monthlyCostCents || num.monthlyCostCents <= 0) return { outcome: "Number has no monthly cost." };

  // Claim the cycle. Advancing the date IS the idempotency guard: only the
  // caller that flips a due row wins; everyone else sees count === 0.
  const claim = await prisma.phoneNumber.updateMany({
    where: { id: numberId, status: "ACTIVE", nextRenewalAt: { lte: now } },
    data: { nextRenewalAt: new Date(now.getTime() + RENEWAL_PERIOD_MS), lastError: null },
  });
  if (claim.count === 0) return { outcome: "Already renewed this cycle." };

  const paid = await spendCreditsAmount(num.userId, num.monthlyCostCents, "phone_number_renewal", {
    // Ref carries the cycle it paid for, so the ledger reads honestly.
    ref: `${numberId}:${now.toISOString().slice(0, 7)}`,
  });
  if (!paid) {
    // Unpaid: pull the claimed date back into a short grace window so it retries
    // soon, rather than releasing a working number now. Sustained non-payment
    // release is a founder policy (releaseNumber exists), not an auto-teardown.
    await prisma.phoneNumber.update({
      where: { id: numberId },
      data: { nextRenewalAt: new Date(now.getTime() + GRACE_MS), lastError: "Rent unpaid: insufficient credits, in grace." },
    });
    return { outcome: "Insufficient credits; number in grace, retrying in 3 days." };
  }

  return { outcome: `Charged ${num.monthlyCostCents} credits for ${num.e164}; next renewal in 30 days.` };
}
