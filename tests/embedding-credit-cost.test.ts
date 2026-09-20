// Proves the REAL credits.ts arithmetic (not a mock of it) for the two new
// embedding-backed actions: build_segment costs exactly 2 credits, remember
// costs exactly 1, and both are blocked with a genuine 402 OpError when the
// balance can't cover the cost. Complements build-segment-credits.test.ts and
// remember-credits.test.ts, which prove the call SITES gate/debit correctly;
// this file proves the underlying meter itself.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const state = { balance: 100 };
  return {
    prisma: {
      $executeRaw: vi.fn(async () => undefined),
      user: {
        findUnique: vi.fn(async () => ({ creditsRemaining: state.balance })),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { creditsRemaining: { gte: number } };
            data: { creditsRemaining: { decrement: number } };
          }) => {
            if (state.balance < where.creditsRemaining.gte) return { count: 0 };
            state.balance -= data.creditsRemaining.decrement;
            return { count: 1 };
          },
        ),
      },
      creditLedger: { create: vi.fn(async () => ({})) },
      __state: state,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { ensureCredits, spendCredits, CREDIT_COSTS } from "@/lib/credits";

const testState = (prisma as unknown as { __state: { balance: number } }).__state;

describe("real credit metering for embedding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.balance = 100;
  });

  it("CREDIT_COSTS matches the documented cost derivation", () => {
    expect(CREDIT_COSTS.build_segment).toBe(2);
    expect(CREDIT_COSTS.remember).toBe(1);
  });

  it("build_segment costs exactly 2 credits", async () => {
    testState.balance = 10;
    await spendCredits("user-1", "build_segment");
    expect(testState.balance).toBe(8);
  });

  it("remember costs exactly 1 credit", async () => {
    testState.balance = 10;
    await spendCredits("user-1", "remember");
    expect(testState.balance).toBe(9);
  });

  it("ensureCredits passes when the balance covers build_segment's cost", async () => {
    testState.balance = 2;
    await expect(ensureCredits("user-1", "build_segment")).resolves.toBeUndefined();
  });

  it("ensureCredits blocks with a 402 OpError when the balance can't cover build_segment", async () => {
    testState.balance = 1;
    await expect(ensureCredits("user-1", "build_segment")).rejects.toMatchObject({
      name: "OpError",
      status: 402,
    });
  });

  it("ensureCredits blocks with a 402 OpError when the balance can't cover remember", async () => {
    testState.balance = 0;
    await expect(ensureCredits("user-1", "remember")).rejects.toMatchObject({
      name: "OpError",
      status: 402,
    });
  });

  it("spendCredits itself blocks with a 402 OpError and leaves the balance untouched", async () => {
    testState.balance = 1;
    await expect(spendCredits("user-1", "build_segment")).rejects.toMatchObject({
      name: "OpError",
      status: 402,
    });
    expect(testState.balance).toBe(1);
  });
});
