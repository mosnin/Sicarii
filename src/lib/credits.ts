// The credit meter - the single module that makes the /pricing claims real.
// 1 credit = $0.01. CRM reads/writes are free; credits are spent only when an
// action pulls real data from the outside world.
// Policy: never charge for a miss - callers debit AFTER a paid lookup actually
// returns data. The atomic decrement on User is the source of truth; the
// CreditLedger row is a best-effort audit trail.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";

export const PLANS = {
  free: { credits: 200, monitors: 0, seats: 1 },
  starter: { credits: 3000, monitors: 1, seats: 1 },
  pro: { credits: 12000, monitors: 10, seats: 1 },
  business: { credits: 8000, monitors: 25, seats: 1 },
  beta: { credits: 10000, monitors: 10, seats: 1 },
  // Teams: one pooled credit meter on the workspace account, shared by every
  // member and every connected agent key. Seats are a soft cap in v1.
  team: { credits: 30000, monitors: 25, seats: 5 },
} as const;

export type PlanName = keyof typeof PLANS;

export function planFor(plan: string | null | undefined) {
  return PLANS[(plan ?? "free") as PlanName] ?? PLANS.free;
}

// Credits per action. Each is priced at roughly 3x the underlying provider
// cost, so usage is always margin-positive (see /pricing).
export const CREDIT_COSTS = {
  web_search: 2,
  linkedin: 3,
  email: 8,
  phone: 12,
  find_companies: 12,
  maps_leads: 15,
  contact_extract: 8,
  serp_search: 4,
  find_socials: 4,
  deep_report: 8,
  analyze_site: 8,
  company_aspect: 30,
  deep_research: 18,
  monitor_run: 10,
  // A single grounded generateObject call (short prompt: activity/email
  // history in, subject+body out) - cheaper than deep_report's multi-source
  // synthesis, priced in line with the other single-LLM-call actions
  // (find_socials=4, contact_extract=8).
  breakup_draft: 6,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

const RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Pre-flight gate: throw OpError 402 BEFORE doing paid work when the balance
 * can't cover the action. Call this at the top of a metered path so an
 * out-of-credits user is blocked before any provider cost is incurred and
 * before any data is saved (otherwise they would get the result for free and
 * only see a 402 after the fact). The real debit still happens via spendCredits
 * only on success, so a genuine miss is never charged.
 */
export async function hasCredits(userId: string, action: CreditAction): Promise<boolean> {
  await maybeReset(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsRemaining: true },
  });
  return Boolean(user) && user!.creditsRemaining >= CREDIT_COSTS[action];
}

export async function ensureCredits(userId: string, action: CreditAction): Promise<void> {
  if (!(await hasCredits(userId, action))) {
    throw new OpError(
      "Out of credits. Upgrade your plan or wait for your monthly reset.",
      402,
    );
  }
}

// The plan->allotment CASE, built from PLANS so the SQL never drifts from the
// source of truth. Plan names are trusted literals and credits are integers;
// both are bound as parameters, not interpolated.
const ALLOTMENT_CASE = Prisma.join(
  Object.entries(PLANS).map(([name, p]) => Prisma.sql`WHEN ${name} THEN ${p.credits}`),
  " ",
);

// Refill the meter when the monthly window has lapsed (or was never started).
// One guarded UPDATE (down from a read + conditional write): the WHERE clause
// makes it a no-op when the window is still active, so it costs a single
// indexed statement on every metered action. The guard also means only the
// first concurrent caller past the window resets (no double-refill race), and
// GREATEST refills the allotment WITHOUT wiping purchased top-ups. A missing
// user simply matches 0 rows; callers handle absence downstream.
async function maybeReset(userId: string): Promise<void> {
  const now = new Date();
  const next = new Date(now.getTime() + RESET_INTERVAL_MS);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE users
    SET "creditsRemaining" = GREATEST(
          "creditsRemaining",
          CASE "plan" ${ALLOTMENT_CASE} ELSE ${PLANS.free.credits} END
        ),
        "creditsResetAt" = ${next}
    WHERE id = ${userId}
      AND ("creditsResetAt" IS NULL OR "creditsResetAt" < ${now})
  `);
}

/**
 * Refill to the plan allotment at a paid renewal WITHOUT destroying purchased
 * top-ups (GREATEST), starting a fresh 30-day window. Used by the Stripe
 * invoice.paid cycle-renewal handler so a subscriber who topped up mid-cycle
 * keeps those credits at renewal.
 *
 * GREATEST alone is only idempotent when re-run immediately; if the user SPENDS
 * between a first apply and a redelivery of the same event, a second refill
 * would top them back up (a small double-grant). Pass `idempotencyRef` (e.g. the
 * Stripe event id) to gate the refill exactly-once: the key insert and the
 * refill run in one transaction, and a redelivery collides on the key (P2002)
 * and is skipped.
 */
export async function refillToAllotment(
  userId: string,
  plan: string,
  idempotencyRef?: string,
): Promise<void> {
  const allotment = planFor(plan).credits;
  const next = new Date(Date.now() + RESET_INTERVAL_MS);

  if (idempotencyRef) {
    const key = `refill:${userId}:${idempotencyRef}`;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({ data: { key, userId } });
        await tx.$executeRaw`
          UPDATE users
          SET "creditsRemaining" = GREATEST("creditsRemaining", ${allotment}),
              "creditsResetAt" = ${next}
          WHERE id = ${userId}
        `;
      });
    } catch (e) {
      if (isUniqueViolation(e)) return; // already refilled for this event
      throw e;
    }
    return;
  }

  await prisma.$executeRaw`
    UPDATE users
    SET "creditsRemaining" = GREATEST("creditsRemaining", ${allotment}),
        "creditsResetAt" = ${next}
    WHERE id = ${userId}
  `;
}

/**
 * Debit credits for a successful metered action. Throws OpError 402 when the
 * balance can't cover the cost. Call this only AFTER the paid lookup returned
 * data (never charge a miss).
 */
export async function spendCredits(
  userId: string,
  action: CreditAction,
  opts: { ref?: string } = {},
): Promise<void> {
  const cost = CREDIT_COSTS[action];

  await maybeReset(userId);

  // Atomic conditional decrement: only succeeds when the balance covers it.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, creditsRemaining: { gte: cost } },
    data: { creditsRemaining: { decrement: cost } },
  });
  if (count === 0) {
    throw new OpError(
      "Out of credits. Upgrade your plan or wait for your monthly reset.",
      402,
    );
  }

  // Best-effort audit trail; a ledger failure never fails the action.
  try {
    const after = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditsRemaining: true },
    });
    await prisma.creditLedger.create({
      data: {
        userId,
        delta: -cost,
        balanceAfter: after?.creditsRemaining ?? 0,
        action,
        ref: opts.ref,
      },
    });
  } catch (e) {
    console.warn("[credits] ledger write failed", e);
  }
}

// Monthly list price (USD) for each paid plan. The single source of truth for
// what a plan costs, used by the x402 subscribe path (Stripe mirrors these in
// its own Price config). Kept next to PLANS so price and allotment move
// together.
export const PLAN_USD = {
  starter: 39,
  pro: 129,
  business: 99,
  team: 299,
} as const;

export type PaidPlanName = keyof typeof PLAN_USD;

/**
 * Has this exact payment ref already been credited? Returns the balance it left
 * behind, or null if never seen. Used to make paid top-ups idempotent against a
 * client that retries after a settlement already went through.
 */
export async function alreadyCredited(
  userId: string,
  ref: string,
): Promise<number | null> {
  const row = await prisma.creditLedger.findFirst({
    where: { userId, ref },
    select: { balanceAfter: true },
  });
  return row ? row.balanceAfter : null;
}

// A P2002 unique-constraint violation (the idempotency key already exists).
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  );
}

/**
 * Add credits from a paid top-up (money in, the inverse of spendCredits).
 *
 * Exactly-once on `ref`: the increment, the ledger row, and an IdempotencyKey
 * insert all run in ONE transaction. A concurrent or retried grant with the
 * same ref collides on the key's PK (P2002), the transaction rolls back, and we
 * return the already-credited balance. This closes the check-then-act race the
 * old findFirst()-then-update pattern left open (two simultaneous retries could
 * both pass the check and double-credit).
 */
export async function addCredits(
  userId: string,
  credits: number,
  opts: { action: string; ref?: string },
): Promise<number> {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new OpError("credits must be a positive integer", 400);
  }

  // No ref => not a payment (no idempotency needed); plain increment.
  if (!opts.ref) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { creditsRemaining: { increment: credits } },
      select: { creditsRemaining: true },
    });
    await prisma.creditLedger.create({
      data: { userId, delta: credits, balanceAfter: updated.creditsRemaining, action: opts.action },
    });
    return updated.creditsRemaining;
  }

  const key = `${userId}:${opts.ref}`;
  try {
    return await prisma.$transaction(async (tx) => {
      // The key insert is the gate: if this ref was already credited it throws
      // P2002 and the whole transaction (including the increment) is discarded.
      await tx.idempotencyKey.create({ data: { key, userId } });
      const updated = await tx.user.update({
        where: { id: userId },
        data: { creditsRemaining: { increment: credits } },
        select: { creditsRemaining: true },
      });
      await tx.creditLedger.create({
        data: {
          userId,
          delta: credits,
          balanceAfter: updated.creditsRemaining,
          action: opts.action,
          ref: opts.ref,
        },
      });
      return updated.creditsRemaining;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Already credited (benign retry): return the current balance, no charge.
      const prior = await alreadyCredited(userId, opts.ref);
      if (prior !== null) return prior;
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { creditsRemaining: true },
      });
      return u?.creditsRemaining ?? 0;
    }
    throw e;
  }
}

/**
 * Apply a paid plan: set the plan, refill to its allotment, and start a fresh
 * 30-day window. Mirrors the Stripe upgrade path, for the x402 subscribe route
 * (USDC is not recurring, so this grants a 30-day pass the agent re-pays).
 * Idempotent on `ref` so a retried payment does not refill twice.
 */
export async function applyPlan(
  userId: string,
  plan: PaidPlanName,
  opts: { ref?: string } = {},
): Promise<void> {
  const credits = PLANS[plan].credits;
  const next = new Date(Date.now() + RESET_INTERVAL_MS);

  // Exactly-once on ref: the idempotency-key insert gates the refill. A retried
  // settlement collides on the key (P2002) and rolls the whole thing back.
  if (opts.ref) {
    const key = `${userId}:${opts.ref}`;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({ data: { key, userId } });
        await tx.$executeRaw`
          UPDATE users
          SET plan = ${plan},
              "creditsRemaining" = GREATEST("creditsRemaining", ${credits}),
              "creditsResetAt" = ${next}
          WHERE id = ${userId}
        `;
        await tx.creditLedger.create({
          data: { userId, delta: credits, balanceAfter: credits, action: `plan_${plan}`, ref: opts.ref },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) return; // already applied, benign retry
      throw e;
    }
    return;
  }

  // No ref (should not happen for paid plans, but keep it correct): non-idempotent.
  await prisma.$executeRaw`
    UPDATE users
    SET plan = ${plan},
        "creditsRemaining" = GREATEST("creditsRemaining", ${credits}),
        "creditsResetAt" = ${next}
    WHERE id = ${userId}
  `;
  await prisma.creditLedger.create({
    data: {
      userId,
      delta: credits,
      balanceAfter: credits,
      action: `plan_${plan}`,
      ref: opts.ref,
    },
  });
}

/** Current plan + meter state for the billing UI (applies a due reset first). */
export async function getBilling(userId: string): Promise<{
  plan: string;
  creditsRemaining: number;
  creditsResetAt: Date | null;
}> {
  await maybeReset(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, creditsRemaining: true, creditsResetAt: true },
  });
  if (!user) throw new OpError("User not found", 404);
  return user;
}
