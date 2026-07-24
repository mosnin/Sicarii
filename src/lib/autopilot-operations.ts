// Budgeted Autopilot - shared, userId-scoped ops for propose/approve/pause and
// the budget guard that lets a plan run unsupervised without ever exceeding
// its approved credit ceiling. Follows the exact conventions of
// crm-operations.ts: every function takes userId first and ownership-checks
// via findUnique + `if (!row || row.userId !== userId) throw new OpError(...)`.
//
// The plan's credit ceiling is an ADDITIONAL cap layered on top of the real
// credit meter (src/lib/credits.ts). Approving a plan never grants credits; it
// only bounds how much of the user's real balance the autopilot loop may spend,
// per category, per window. Real credits are still debited by the underlying
// ops (findCompanies, enrichEntity, ...) exactly as they always were - this
// module never calls spendCredits itself, it only measures and caps it.

import { Prisma, type AutopilotCategory, type AutopilotStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import type { ActivityActor } from "@/lib/crm-operations";

export const AUTOPILOT_CATEGORIES = ["discovery", "enrichment", "outreach", "other"] as const;
export type Category = (typeof AUTOPILOT_CATEGORIES)[number];

const CADENCES = ["hourly", "daily", "weekly"] as const;
export type Cadence = (typeof CADENCES)[number];

const CADENCE_MS: Record<Cadence, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

// Statuses that mean "not currently running" - the set an approve call may
// transition FROM. A plan already active/approved cannot be re-approved.
const APPROVABLE_FROM = new Set<AutopilotStatus>(["draft", "paused", "exhausted"]);
// Statuses a pause call may transition FROM.
const PAUSABLE_FROM = new Set<AutopilotStatus>(["approved", "active"]);

export function isCadence(v: unknown): v is Cadence {
  return typeof v === "string" && (CADENCES as readonly string[]).includes(v);
}

function cadenceMs(cadence: string): number {
  return CADENCE_MS[(isCadence(cadence) ? cadence : "weekly") as Cadence];
}

/* ------------------------------- Propose ------------------------------ */

export interface ProposeAllocations {
  discovery?: number;
  enrichment?: number;
  outreach?: number;
  other?: number;
}

export interface ProposeInput {
  name: string;
  cadence?: string;
  totalCredits: number;
  allocations: ProposeAllocations;
  discoveryQuery?: string | null;
}

/** Create a draft plan (never runnable until a human approves it). An agent
 *  proposing a plan can never set its own status - it is always born "draft". */
export async function proposeAutopilotPlan(userId: string, input: ProposeInput) {
  if (!input.name?.trim()) throw new OpError("name is required", 400);
  if (!Number.isInteger(input.totalCredits) || input.totalCredits <= 0)
    throw new OpError("totalCredits must be a positive integer", 400);

  const allocations = AUTOPILOT_CATEGORIES.map((category) => ({
    category,
    allocated: Math.max(0, Math.trunc(input.allocations[category] ?? 0)),
  }));
  const sum = allocations.reduce((s, a) => s + a.allocated, 0);
  if (sum !== input.totalCredits) {
    throw new OpError(
      `allocations (${sum}) must sum exactly to totalCredits (${input.totalCredits})`,
      400,
    );
  }
  if (sum === 0) throw new OpError("at least one category must have a nonzero allocation", 400);

  const cadence = isCadence(input.cadence) ? input.cadence : "weekly";

  return prisma.autopilotPlan.create({
    data: {
      userId,
      name: input.name.trim().slice(0, 200),
      cadence,
      totalCredits: input.totalCredits,
      discoveryQuery: input.discoveryQuery?.trim() || null,
      status: "draft",
      allocations: { create: allocations },
    },
    include: { allocations: true },
  });
}

/* -------------------------------- Reads -------------------------------- */

export function listAutopilotPlans(userId: string, limit?: number) {
  return prisma.autopilotPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      allocations: { orderBy: { category: "asc" } },
      runs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
    take: Math.min(Math.max(limit ?? 20, 1), 50),
  });
}

export async function getAutopilotPlan(userId: string, id: string) {
  const plan = await prisma.autopilotPlan.findUnique({
    where: { id },
    include: {
      allocations: { orderBy: { category: "asc" } },
      runs: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!plan || plan.userId !== userId) throw new OpError("Autopilot plan not found", 404);
  return plan;
}

/** Status + budget summary for an agent to check before/instead of a full
 *  get. When id is omitted, returns the most recently updated plans. */
export async function getAutopilotStatus(userId: string, id?: string) {
  if (id) return getAutopilotPlan(userId, id);
  return listAutopilotPlans(userId, 10);
}

/* ------------------------------- Approve ------------------------------- */

/** Flip a draft/paused/exhausted plan to active and open a fresh window.
 *  HUMAN-ONLY: callers must resolve `approvedBy` from a Clerk session, never
 *  an API key - enforced by the caller (the REST route uses
 *  getAuthenticatedUser(), which only reads the Clerk session cookie; there is
 *  no MCP tool for this operation at all). Resets spent counters to 0 so a
 *  re-approval after a pause/exhaustion starts a clean window rather than
 *  inheriting a stale one. */
export async function approveAutopilotPlan(
  userId: string,
  id: string,
  approvedBy: { id: string; label: string },
) {
  const plan = await prisma.autopilotPlan.findUnique({ where: { id } });
  if (!plan || plan.userId !== userId) throw new OpError("Autopilot plan not found", 404);
  if (!APPROVABLE_FROM.has(plan.status))
    throw new OpError(`Plan is already ${plan.status} - nothing to approve`, 400);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + cadenceMs(plan.cadence));

  const [, updated] = await prisma.$transaction([
    prisma.autopilotAllocation.updateMany({ where: { planId: id }, data: { spent: 0 } }),
    prisma.autopilotPlan.update({
      where: { id },
      data: {
        status: "active",
        approvedAt: now,
        approvedById: approvedBy.id,
        pausedReason: null,
        windowStart: now,
        windowEnd,
        // Run soon so the human sees value quickly; the scheduler will roll
        // the window forward by cadence after each successful tick.
        nextRunAt: now,
      },
      include: { allocations: true },
    }),
  ]);
  return updated;
}

/* -------------------------------- Pause -------------------------------- */

/** Pause an active plan. Callable by a human (REST/UI) OR an agent (MCP
 *  pause_autopilot) - unlike approve, pausing is not a privileged action; any
 *  actor who can see the plan can stop it from spending further. */
export async function pauseAutopilotPlan(
  userId: string,
  id: string,
  opts: { reason?: string; actor?: ActivityActor | null } = {},
) {
  const plan = await prisma.autopilotPlan.findUnique({ where: { id } });
  if (!plan || plan.userId !== userId) throw new OpError("Autopilot plan not found", 404);
  if (!PAUSABLE_FROM.has(plan.status))
    throw new OpError(`Plan is ${plan.status}, not running - nothing to pause`, 400);

  const who = opts.actor?.label ?? "you";
  return prisma.autopilotPlan.update({
    where: { id },
    data: {
      status: "paused",
      pausedReason: opts.reason?.trim() || `Paused by ${who}.`,
    },
    include: { allocations: true },
  });
}

/* ---------------------------- Budget guard ------------------------------ */
//
// The core engineering: when the autopilot loop wants to run a metered
// action, it must (a) check the plan's remaining allocation for that
// category, (b) hard-stop cleanly (never throw a raw 402) when the category
// is exhausted, and (c) record the spend against the plan atomically. This
// composes with spendCredits - the real user meter - rather than replacing
// it: runAutopilotStep below calls the real op (which debits the real meter
// itself) and then charges the PLAN's ceiling with the amount actually
// observed to have been spent, never a guess.

export interface AllocationRemaining {
  allocated: number;
  spent: number;
  remaining: number;
}

/** A non-committing peek at a category's remaining room. Used as a pre-flight
 *  check before attempting real paid work, so an exhausted category never
 *  even reaches the provider. */
export async function autopilotAllocationRemaining(
  planId: string,
  category: Category,
): Promise<AllocationRemaining | null> {
  const row = await prisma.autopilotAllocation.findFirst({ where: { planId, category } });
  if (!row) return null;
  return { allocated: row.allocated, spent: row.spent, remaining: Math.max(0, row.allocated - row.spent) };
}

/**
 * Atomically charge `amount` credits against a plan's category allocation.
 * Single conditional SQL UPDATE (spent = spent + amount WHERE spent + amount
 * <= allocated), the same atomicity pattern spendCredits uses for the credit
 * meter's decrement: the WHERE clause is evaluated against the row's current
 * committed value under the row lock the UPDATE takes, so two concurrent
 * charges against the same allocation can never both succeed past the cap -
 * Postgres serializes them. Returns ok:false (0 rows touched) when the charge
 * would exceed the ceiling; the caller never gets a partial/negative charge.
 */
export async function chargeAutopilotCategory(
  planId: string,
  category: Category,
  amount: number,
): Promise<{ ok: boolean }> {
  if (amount <= 0) return { ok: true };
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE autopilot_allocations
    SET spent = spent + ${amount}, "updatedAt" = now()
    WHERE "planId" = ${planId}
      AND category = ${category}::"AutopilotCategory"
      AND spent + ${amount} <= allocated
    RETURNING id
  `);
  return { ok: rows.length > 0 };
}

/** Unconditionally record a charge that already happened in reality (real
 *  credits were already debited from the user's meter by the underlying op,
 *  so this can never be "undone" - hiding it would make the plan's ledger
 *  dishonest). Used only in the narrow race where a concurrent tick consumed
 *  the remaining headroom between the pre-flight peek and the real spend. */
async function forceChargeAutopilotCategory(
  planId: string,
  category: Category,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE autopilot_allocations
    SET spent = spent + ${amount}, "updatedAt" = now()
    WHERE "planId" = ${planId} AND category = ${category}::"AutopilotCategory"
  `);
}

/** Hard-stop the plan: "exhausted" when the whole approved budget for this
 *  window is now spent, "paused" when only the triggering category is at cap
 *  (other categories may still have room this window). Guarded to only
 *  transition FROM active, so it never clobbers a plan a human already
 *  paused/completed out from under them (idempotent no-op otherwise). */
async function hardStopPlan(planId: string, triggeredCategory: Category): Promise<void> {
  const allocations = await prisma.autopilotAllocation.findMany({ where: { planId } });
  if (allocations.length === 0) return;
  const totalAllocated = allocations.reduce((s, a) => s + a.allocated, 0);
  const totalSpent = allocations.reduce((s, a) => s + a.spent, 0);
  const allExhausted = allocations.every((a) => a.spent >= a.allocated);

  const trigger = allocations.find((a) => a.category === triggeredCategory);
  const status: AutopilotStatus = allExhausted || totalSpent >= totalAllocated ? "exhausted" : "paused";
  const reason =
    status === "exhausted"
      ? `Full budget spent for this window (${totalSpent}/${totalAllocated} credits).`
      : `${triggeredCategory} allocation exhausted (${trigger?.spent ?? 0}/${trigger?.allocated ?? 0} credits). ` +
        `Other categories may still have room; re-approve to open a fresh window.`;

  await prisma.autopilotPlan.updateMany({
    where: { id: planId, status: "active" },
    data: { status, pausedReason: reason },
  });
}

/** Append an audit row so the human can see exactly what the autopilot did. */
export async function recordAutopilotRun(input: {
  planId: string;
  userId: string;
  category: Category;
  action: string;
  creditsSpent: number;
  ref?: string | null;
  summary?: string | null;
}) {
  return prisma.autopilotRun.create({
    data: {
      planId: input.planId,
      userId: input.userId,
      category: input.category,
      action: input.action,
      creditsSpent: Math.max(0, input.creditsSpent),
      ref: input.ref ?? null,
      summary: input.summary ?? null,
    },
  });
}

export type StepResult<T> =
  | { ran: true; result: T; creditsSpent: number }
  | { ran: false; reason: string };

/**
 * Run one metered autopilot step under the budget guard, and log it.
 *
 * Order of operations (why this is atomic and never over-spends):
 * 1. Pre-flight peek: if `cost` would exceed the category's remaining room,
 *    hard-stop the plan and return WITHOUT calling `run()` at all - an
 *    exhausted category never even reaches the paid provider.
 * 2. Call `run()`. The underlying op (findCompanies, enrichEntity, ...) does
 *    its own ensureCredits/spendCredits against the REAL user meter,
 *    completely unchanged - this function never touches that path.
 * 3. Measure the ACTUAL amount spent by reading the user's real balance
 *    before/after, rather than assuming `run()` always spends exactly `cost`
 *    (idempotent enrich, a dry discovery search, and a "miss" all spend 0).
 *    This is the source of truth for what to charge the plan.
 * 4. Atomically charge the plan's category allocation with the observed
 *    amount (step ➋ under chargeAutopilotCategory). Because every metered
 *    action costs a FIXED amount (CREDIT_COSTS[action] is a constant, never
 *    variable), and the peek in step 1 already confirmed that fixed amount
 *    fits, this charge succeeds by construction in the normal (single-tick,
 *    non-concurrent) case. The only way it can fail is a genuine concurrent
 *    tick racing the same plan between steps 1 and 4 - real credits were
 *    already spent by then, so this function records the true spend anyway
 *    (never hides a real cost) and immediately hard-stops the plan so no
 *    further steps run this cycle.
 */
export async function runAutopilotStep<T>(opts: {
  userId: string;
  planId: string;
  category: Category;
  action: string;
  cost: number;
  ref?: string;
  run: () => Promise<T>;
  summaryFor: (result: T) => string;
}): Promise<StepResult<T>> {
  const { userId, planId, category, action, cost, ref, run, summaryFor } = opts;

  if (cost > 0) {
    const remaining = await autopilotAllocationRemaining(planId, category);
    if (!remaining || remaining.remaining < cost) {
      await hardStopPlan(planId, category);
      return { ran: false, reason: `${category} budget exhausted` };
    }
  }

  const before = cost > 0 ? await creditsRemainingFor(userId) : 0;
  let result: T;
  try {
    result = await run();
  } catch (e) {
    if (e instanceof OpError) return { ran: false, reason: e.message };
    throw e;
  }

  let spent = 0;
  if (cost > 0) {
    const after = await creditsRemainingFor(userId);
    spent = Math.max(0, before - after);
  }

  if (spent > 0) {
    const charge = await chargeAutopilotCategory(planId, category, spent);
    if (!charge.ok) {
      // Real credits were already spent for real (see doc comment above) - a
      // same-tick race consumed the remaining room between the peek and here.
      // Record it honestly and hard-stop; never silently drop a real charge.
      await forceChargeAutopilotCategory(planId, category, spent);
      await hardStopPlan(planId, category);
    }
  }

  await recordAutopilotRun({
    planId,
    userId,
    category,
    action,
    creditsSpent: spent,
    ref,
    summary: summaryFor(result),
  });

  return { ran: true, result, creditsSpent: spent };
}

async function creditsRemainingFor(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditsRemaining: true } });
  return user?.creditsRemaining ?? 0;
}

/** Reset spent=0 and open a fresh window; called by the scheduler after a
 *  tick completes with the plan still active (i.e. it did not hard-stop). */
export async function rolloverAutopilotWindow(
  planId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.autopilotAllocation.updateMany({ where: { planId }, data: { spent: 0 } }),
    prisma.autopilotPlan.updateMany({
      where: { id: planId, status: "active" },
      data: { windowStart, windowEnd, lastRunAt: windowStart, nextRunAt: windowEnd },
    }),
  ]);
}

export { cadenceMs };
export type { AutopilotCategory, AutopilotStatus };
