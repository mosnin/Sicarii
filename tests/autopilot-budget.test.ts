// Budgeted Autopilot - the budget guard is the core engineering claim of this
// feature ("never exceed the approved allocation, hard-stop instead of
// throwing a raw 402"). These tests prove it against a simulated Postgres row
// so the atomic conditional UPDATE semantics (spent = spent + amount WHERE
// spent + amount <= allocated) are exercised exactly as chargeAutopilotCategory
// issues them, not just the happy path.

import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory stand-in for the one allocation row under test, with the
// SAME atomicity semantics as the real conditional UPDATE: a charge only
// applies when spent + amount <= allocated, and it happens as one indivisible
// step (no interleaving) - exactly what a single Postgres UPDATE statement
// guarantees under its row lock.
function makeAllocationRow(allocated: number) {
  return { planId: "plan-1", category: "discovery", allocated, spent: 0 };
}

let allocationRow: ReturnType<typeof makeAllocationRow>;
let planStatus: string;
let updateManyCalls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
let userCredits: number;

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      autopilotAllocation: {
        findFirst: vi.fn(async ({ where }: { where: { planId: string; category: string } }) => {
          if (where.category !== allocationRow.category) return null;
          return { id: "alloc-1", ...allocationRow };
        }),
        findMany: vi.fn(async () => [{ ...allocationRow }]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      autopilotPlan: {
        findUnique: vi.fn(async () => ({ id: "plan-1", userId: "user-A", status: planStatus })),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          updateManyCalls.push({ where, data });
          if (where.status && where.status !== planStatus) return { count: 0 };
          if (typeof data.status === "string") planStatus = data.status;
          return { count: 1 };
        }),
      },
      autopilotRun: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run-1", ...data })),
      },
      user: {
        findUnique: vi.fn(async () => ({ creditsRemaining: userCredits })),
      },
      // The atomic conditional charge: mirrors "UPDATE ... WHERE spent + $amount
      // <= allocated" against the in-memory row, applying the increment only
      // when it fits - exactly the invariant chargeAutopilotCategory relies on.
      // Prisma.sql tagged templates expose `.values`, the bound params in
      // template order; `amount` is interpolated first (in the SET clause) in
      // both queries below, so values[0] is always the charge amount.
      $queryRaw: vi.fn(async (query: unknown) => {
        const values = (query as { values: unknown[] }).values;
        const amount = Number(values[0]);
        if (allocationRow.spent + amount <= allocationRow.allocated) {
          allocationRow.spent += amount;
          return [{ id: "alloc-1" }];
        }
        return [];
      }),
      $executeRaw: vi.fn(async (query: unknown) => {
        const values = (query as { values: unknown[] }).values;
        const amount = Number(values[0]);
        allocationRow.spent += amount; // unconditional force-charge (real spend, never dropped)
        return 1;
      }),
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    },
  };
});

import {
  chargeAutopilotCategory,
  autopilotAllocationRemaining,
  runAutopilotStep,
} from "@/lib/autopilot-operations";

beforeEach(() => {
  allocationRow = makeAllocationRow(100);
  planStatus = "active";
  updateManyCalls = [];
  userCredits = 1000;
});

describe("chargeAutopilotCategory - atomic conditional charge", () => {
  it("applies a charge that fits within the remaining allocation", async () => {
    const result = await chargeAutopilotCategory("plan-1", "discovery", 40);
    expect(result.ok).toBe(true);
    expect(allocationRow.spent).toBe(40);
  });

  it("refuses a charge that would exceed the allocation and leaves spent untouched", async () => {
    allocationRow.spent = 90;
    const result = await chargeAutopilotCategory("plan-1", "discovery", 20);
    expect(result.ok).toBe(false);
    expect(allocationRow.spent).toBe(90); // unchanged - never a partial charge
  });

  it("never lets cumulative charges exceed the allocation, even across many calls", async () => {
    // Fire 20 charges of 12 credits against a 100-credit allocation. Only 8
    // can ever fit (96 <= 100); the 9th must be refused. This is the
    // never-exceed-allocation invariant exercised directly against the same
    // conditional-UPDATE semantics the real SQL uses.
    let accepted = 0;
    for (let i = 0; i < 20; i++) {
      const r = await chargeAutopilotCategory("plan-1", "discovery", 12);
      if (r.ok) accepted++;
    }
    expect(accepted).toBe(8);
    expect(allocationRow.spent).toBe(96);
    expect(allocationRow.spent).toBeLessThanOrEqual(allocationRow.allocated);
  });

  it("a zero/negative amount is always a no-op success and never touches spent", async () => {
    const result = await chargeAutopilotCategory("plan-1", "discovery", 0);
    expect(result.ok).toBe(true);
    expect(allocationRow.spent).toBe(0);
  });
});

describe("autopilotAllocationRemaining", () => {
  it("reports remaining as allocated minus spent, floored at zero", async () => {
    allocationRow.spent = 30;
    const remaining = await autopilotAllocationRemaining("plan-1", "discovery");
    expect(remaining).toEqual({ allocated: 100, spent: 30, remaining: 70 });
  });

  it("returns null for a category with no allocation row", async () => {
    const remaining = await autopilotAllocationRemaining("plan-1", "enrichment");
    expect(remaining).toBeNull();
  });
});

describe("runAutopilotStep - the budget guard around a real action", () => {
  it("hard-stops WITHOUT calling the action when the category is already exhausted (never a raw 402)", async () => {
    allocationRow.spent = 100; // fully spent
    const runFn = vi.fn(async () => ({ added: 1 }));

    const result = await runAutopilotStep({
      userId: "user-A",
      planId: "plan-1",
      category: "discovery",
      action: "find_companies",
      cost: 12,
      run: runFn,
      summaryFor: () => "should not be reached",
    });

    expect(result.ran).toBe(false);
    expect(runFn).not.toHaveBeenCalled(); // exhausted category never reaches the paid provider
    if (!result.ran) expect(result.reason).toMatch(/exhausted/);
    // The plan was hard-stopped cleanly, not by throwing.
    expect(planStatus).toBe("exhausted"); // fully allocated budget consumed -> exhausted, not paused
  });

  it("charges only the REAL amount observed to have been spent, not the nominal cost, on a free miss", async () => {
    // The op runs but spends nothing (e.g. an idempotent enrich short-circuit,
    // or a dry search) - the user's real credit balance doesn't move.
    const runFn = vi.fn(async () => ({ ok: true }));

    const result = await runAutopilotStep({
      userId: "user-A",
      planId: "plan-1",
      category: "discovery",
      action: "find_companies",
      cost: 12,
      run: runFn,
      summaryFor: () => "ran but free",
    });

    expect(result.ran).toBe(true);
    if (result.ran) expect(result.creditsSpent).toBe(0);
    expect(allocationRow.spent).toBe(0); // never charged for a miss, mirrors spendCredits policy
    expect(runFn).toHaveBeenCalledTimes(1);
  });

  it("charges the plan the exact real spend observed via the user's credit delta", async () => {
    const runFn = vi.fn(async () => {
      userCredits -= 12; // simulate the real op's own spendCredits() debit
      return { added: 3 };
    });

    const result = await runAutopilotStep({
      userId: "user-A",
      planId: "plan-1",
      category: "discovery",
      action: "find_companies",
      cost: 12,
      run: runFn,
      summaryFor: (r) => `added ${r.added}`,
    });

    expect(result.ran).toBe(true);
    if (result.ran) expect(result.creditsSpent).toBe(12);
    expect(allocationRow.spent).toBe(12);
  });

  it("propagates an OpError from the action as a clean hard-stop, never an unhandled throw", async () => {
    const { OpError } = await import("@/lib/crm-operations");
    const runFn = vi.fn(async () => {
      throw new OpError("Out of credits.", 402);
    });

    const result = await runAutopilotStep({
      userId: "user-A",
      planId: "plan-1",
      category: "discovery",
      action: "find_companies",
      cost: 12,
      run: runFn,
      summaryFor: () => "unreachable",
    });

    expect(result.ran).toBe(false);
    if (!result.ran) expect(result.reason).toBe("Out of credits.");
    expect(allocationRow.spent).toBe(0); // a real miss must never be charged to the plan either
  });
});
