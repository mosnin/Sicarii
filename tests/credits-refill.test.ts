// Stripe invoice.paid and x402 subscribe both refill the meter. A retried
// webhook or settlement must not grant credits twice, and GREATEST must
// keep mid-cycle top-ups. addCredits idempotency is in
// tests/credits-idempotency.test.ts; this file pins refillToAllotment and
// applyPlan, which #78's webhook tests mock away.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { seen, executeRaw, ledgerCreate } = vi.hoisted(() => ({
  seen: new Set<string>(),
  executeRaw: vi.fn(),
  ledgerCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const makeTx = () => ({
    idempotencyKey: {
      create: vi.fn(async ({ data }: { data: { key: string } }) => {
        if (seen.has(data.key)) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        seen.add(data.key);
        return { key: data.key };
      }),
    },
    $executeRaw: executeRaw,
    creditLedger: { create: ledgerCreate },
  });

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
        return fn(makeTx());
      }),
      $executeRaw: executeRaw,
    },
  };
});

import { refillToAllotment, applyPlan, PLANS } from "@/lib/credits";

function sqlFromCall(call: unknown[] | undefined): { sql: string; values: unknown[] } {
  if (!call) return { sql: "", values: [] };
  const [strings, ...values] = call;
  const parts = Array.isArray(strings) ? strings : [];
  return { sql: parts.join("?"), values };
}

beforeEach(() => {
  seen.clear();
  executeRaw.mockReset().mockResolvedValue(1);
  ledgerCreate.mockReset().mockResolvedValue({});
});

describe("refillToAllotment", () => {
  it("refills once, then a retry with the same Stripe event id does not run SQL again", async () => {
    await refillToAllotment("user-1", "pro", "evt_cycle_1");
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(seen.has("refill:user-1:evt_cycle_1")).toBe(true);

    await refillToAllotment("user-1", "pro", "evt_cycle_1");
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("uses GREATEST against the plan allotment so purchased top-ups survive renewal", async () => {
    await refillToAllotment("user-1", "pro", "evt_cycle_2");
    const { sql, values } = sqlFromCall(executeRaw.mock.calls[0] as unknown[]);
    expect(sql).toContain("GREATEST");
    expect(sql).toContain("creditsRemaining");
    expect(values).toContain(PLANS.pro.credits);
    expect(values).toContain("user-1");
  });

  it("namespaces the idempotency key so a refill cannot collide with addCredits", async () => {
    await refillToAllotment("user-1", "starter", "shared-ref");
    expect([...seen]).toEqual(["refill:user-1:shared-ref"]);
    expect(seen.has("user-1:shared-ref")).toBe(false);
  });

  it("a different event id refills independently", async () => {
    await refillToAllotment("user-1", "pro", "evt_a");
    await refillToAllotment("user-1", "pro", "evt_b");
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});

describe("applyPlan", () => {
  it("applies a paid plan once; a retried settlement does not refill again", async () => {
    await applyPlan("user-1", "starter", { ref: "x402:pay-1" });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(ledgerCreate).toHaveBeenCalledTimes(1);

    await applyPlan("user-1", "starter", { ref: "x402:pay-1" });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(ledgerCreate).toHaveBeenCalledTimes(1);
  });

  it("sets the plan and GREATEST-refills to that plan's allotment", async () => {
    await applyPlan("user-1", "team", { ref: "x402:pay-team" });
    const { sql, values } = sqlFromCall(executeRaw.mock.calls[0] as unknown[]);
    expect(sql).toContain("GREATEST");
    expect(values).toContain("team");
    expect(values).toContain(PLANS.team.credits);
    expect(values).toContain("user-1");
  });
});
