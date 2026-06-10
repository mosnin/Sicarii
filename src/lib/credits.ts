// The credit meter - the single module that makes the /pricing claims real.
// 1 credit = $0.01. CRM reads/writes are free; credits are spent only when an
// action pulls real data from the outside world (or runs the agent's LLM).
// Policy: never charge for a miss - callers debit AFTER a paid lookup actually
// returns data. The atomic decrement on User is the source of truth; the
// CreditLedger row is a best-effort audit trail.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";

export const PLANS = {
  free: { credits: 200, monitors: 0 },
  starter: { credits: 3000, monitors: 1 },
  pro: { credits: 12000, monitors: 10 },
  business: { credits: 8000, monitors: 25 },
  beta: { credits: 10000, monitors: 10 },
} as const;

export type PlanName = keyof typeof PLANS;

export function planFor(plan: string | null | undefined) {
  return PLANS[(plan ?? "free") as PlanName] ?? PLANS.free;
}

// Credits per action. Each is priced at roughly 3x the underlying provider
// cost, so usage is always margin-positive (see /pricing).
export const CREDIT_COSTS = {
  agent_turn: 1,
  web_search: 2,
  linkedin: 3,
  email: 8,
  phone: 12,
  find_companies: 12,
  maps_leads: 15,
  contact_extract: 8,
  serp_search: 4,
  deep_report: 8,
  analyze_site: 8,
  company_aspect: 30,
  deep_research: 18,
  monitor_run: 10,
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

// Refill the meter when the monthly window has lapsed (or was never started).
// Not perfectly race-proof across concurrent requests, but the worst case is
// two refills to the same allotment, which is idempotent in effect.
async function maybeReset(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, creditsResetAt: true },
  });
  if (!user) throw new OpError("User not found", 404);

  const now = new Date();
  if (!user.creditsResetAt || user.creditsResetAt < now) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        creditsRemaining: planFor(user.plan).credits,
        creditsResetAt: new Date(now.getTime() + RESET_INTERVAL_MS),
      },
    });
  }
}

/**
 * Debit credits for a successful metered action. Throws OpError 402 when the
 * balance can't cover the cost. Call this only AFTER the paid lookup returned
 * data (never charge a miss), except agent turns which always consume the LLM.
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
