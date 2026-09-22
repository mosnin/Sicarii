import { beforeEach, describe, expect, it, vi } from "vitest";

type Settlement = {
  ref: string;
  userId: string;
  transaction: string;
  kind: string;
  amount: string;
};

const state = {
  settlements: new Map<string, Settlement>(),
  credits: new Map<string, { userId: string; balanceAfter: number }>(),
  settleOk: true,
  settleCalls: 0,
  addCalls: 0,
  addShouldFail: 0,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    x402Settlement: {
      findUnique: vi.fn(async ({ where }: { where: { ref: string } }) => {
        const row = state.settlements.get(where.ref);
        return row ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Settlement }) => {
        if (state.settlements.has(data.ref)) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        state.settlements.set(data.ref, data);
        return data;
      }),
    },
  },
}));

vi.mock("@/lib/x402", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/x402")>();
  return {
    ...actual,
    verifyPayment: vi.fn(async () => ({ ok: true as const })),
    settlePayment: vi.fn(async () => {
      state.settleCalls += 1;
      if (!state.settleOk) return { ok: false as const, reason: "already_settled" };
      return { ok: true as const, transaction: "0xtx", responseHeader: "hdr" };
    }),
  };
});

vi.mock("@/lib/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits")>();
  return {
    ...actual,
    alreadyCreditedAny: vi.fn(async (ref: string) => state.credits.get(ref) ?? null),
    alreadyCredited: vi.fn(async (userId: string, ref: string) => {
      const row = state.credits.get(ref);
      return row && row.userId === userId ? row.balanceAfter : null;
    }),
    addCredits: vi.fn(async (userId: string, credits: number, opts: { ref?: string }) => {
      state.addCalls += 1;
      if (state.addShouldFail > 0) {
        state.addShouldFail -= 1;
        throw new Error("db blip");
      }
      if (opts.ref && state.credits.has(opts.ref)) {
        return state.credits.get(opts.ref)!.balanceAfter;
      }
      const balance = 200 + credits;
      if (opts.ref) state.credits.set(opts.ref, { userId, balanceAfter: balance });
      return balance;
    }),
    applyPlan: vi.fn(async (userId: string, _plan: string, opts: { ref?: string }) => {
      if (opts.ref && !state.credits.has(opts.ref)) {
        state.credits.set(opts.ref, { userId, balanceAfter: 3000 });
      }
    }),
  };
});

import { settleAndApplyPlan, settleAndCredit } from "@/lib/x402-grant";

const payload = { payload: { authorization: { nonce: "0xabc" } } } as never;
const requirements = { resource: "https://tryscalar.xyz/api/x402/pay" } as never;

describe("settleAndCredit recovery", () => {
  beforeEach(() => {
    state.settlements.clear();
    state.credits.clear();
    state.settleOk = true;
    state.settleCalls = 0;
    state.addCalls = 0;
    state.addShouldFail = 0;
  });

  it("settles once, records the nonce, then credits", async () => {
    const result = await settleAndCredit({
      userId: "user-a",
      credits: 8,
      payload,
      requirements,
      ledgerAction: "pay_email",
    });
    expect(result).toMatchObject({ ok: true, credited: 8, duplicate: false, transaction: "0xtx" });
    expect(state.settleCalls).toBe(1);
    expect(state.settlements.has("x402:0xabc")).toBe(true);
    expect(state.credits.get("x402:0xabc")?.userId).toBe("user-a");
  });

  it("refuses a nonce that already credited another account", async () => {
    state.credits.set("x402:0xabc", { userId: "user-a", balanceAfter: 50 });
    const result = await settleAndCredit({
      userId: "user-b",
      credits: 8,
      payload,
      requirements,
      ledgerAction: "pay_email",
    });
    expect(result).toEqual({
      ok: false,
      reason: "This payment already credited another account.",
    });
    expect(state.settleCalls).toBe(0);
  });

  it("grants after settle even when a later retry cannot re-settle", async () => {
    state.settlements.set("x402:0xabc", {
      ref: "x402:0xabc",
      userId: "user-a",
      transaction: "0xtx",
      kind: "credits",
      amount: "8",
    });
    state.settleOk = false;

    const result = await settleAndCredit({
      userId: "user-a",
      credits: 8,
      payload,
      requirements,
      ledgerAction: "pay_email",
    });
    expect(result).toMatchObject({ ok: true, credited: 8, duplicate: false });
    expect(state.settleCalls).toBe(0);
    expect(state.credits.get("x402:0xabc")?.userId).toBe("user-a");
  });

  it("returns duplicate on a benign retry after the grant landed", async () => {
    state.credits.set("x402:0xabc", { userId: "user-a", balanceAfter: 208 });
    const result = await settleAndCredit({
      userId: "user-a",
      credits: 8,
      payload,
      requirements,
      ledgerAction: "pay_email",
    });
    expect(result).toMatchObject({ ok: true, credited: 0, duplicate: true, balance: 208 });
    expect(state.settleCalls).toBe(0);
    expect(state.addCalls).toBe(0);
  });

  it("rejects a settlement recorded to a different account", async () => {
    state.settlements.set("x402:0xabc", {
      ref: "x402:0xabc",
      userId: "user-a",
      transaction: "0xtx",
      kind: "credits",
      amount: "8",
    });
    const result = await settleAndCredit({
      userId: "user-b",
      credits: 8,
      payload,
      requirements,
      ledgerAction: "pay_email",
    });
    expect(result.ok).toBe(false);
    expect(state.settleCalls).toBe(0);
  });
});

describe("settleAndApplyPlan recovery", () => {
  beforeEach(() => {
    state.settlements.clear();
    state.credits.clear();
    state.settleOk = true;
    state.settleCalls = 0;
  });

  it("applies a plan from a recorded settlement without settling again", async () => {
    state.settlements.set("x402:0xabc", {
      ref: "x402:0xabc",
      userId: "user-a",
      transaction: "0xtx",
      kind: "plan",
      amount: "pro",
    });
    state.settleOk = false;
    const result = await settleAndApplyPlan({
      userId: "user-a",
      plan: "pro",
      payload,
      requirements,
    });
    expect(result).toMatchObject({ ok: true, duplicate: false, transaction: "0xtx" });
    expect(state.settleCalls).toBe(0);
    expect(state.credits.has("x402:0xabc")).toBe(true);
  });
});
