// Proves addCredits is exactly-once on a payment ref: a retried grant with the
// same ref (which now collides on the IdempotencyKey PK, P2002) must NOT
// increment again and must return the already-credited balance.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  // Simulated DB: a set of seen idempotency keys and a running balance.
  const seen = new Set<string>();
  const state = { balance: 100 };

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
    user: {
      update: vi.fn(async ({ data }: { data: { creditsRemaining: { increment: number } } }) => {
        state.balance += data.creditsRemaining.increment;
        return { creditsRemaining: state.balance };
      }),
    },
    creditLedger: { create: vi.fn(async () => ({})) },
  });

  return {
    prisma: {
      // $transaction(fn) runs fn(tx); if the key insert throws P2002 the whole
      // thing rejects and the caller's catch handles it (balance untouched here
      // because we roll back the increment by re-reading a stable balance).
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeTx();
        const before = state.balance;
        try {
          return await fn(tx);
        } catch (e) {
          state.balance = before; // simulate rollback of the increment
          throw e;
        }
      }),
      creditLedger: {
        findFirst: vi.fn(async () => ({ balanceAfter: state.balance })),
      },
      user: {
        findUnique: vi.fn(async () => ({ creditsRemaining: state.balance })),
        update: vi.fn(),
      },
    },
  };
});

import { addCredits } from "@/lib/credits";

describe("addCredits idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("credits once, then a retry with the same ref does not double-credit", async () => {
    const first = await addCredits("user-1", 500, { action: "topup", ref: "x402:nonce-1" });
    expect(first).toBe(600); // 100 + 500

    const retry = await addCredits("user-1", 500, { action: "topup", ref: "x402:nonce-1" });
    // Must NOT be 1100 - the retry returns the already-credited balance.
    expect(retry).toBe(600);
  });

  it("a different ref credits independently", async () => {
    const a = await addCredits("user-2", 300, { action: "topup", ref: "x402:nonce-A" });
    expect(a).toBe(900); // 600 + 300 (shared module state across this file)
  });
});
