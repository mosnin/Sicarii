// Proves storeMemory (called by the MCP `remember` tool) meters the OpenAI
// embedding call: gated on credits BEFORE the paid call, debited only after
// the memory is actually persisted, never charged on a miss, and NOT metered
// at all unless the caller opts in via chargeCredits - the in-app agent's
// automatic per-turn memory writes (src/app/api/agent/route.ts) must stay
// free, matching tests/credits.test.ts's "does not price normal agent chat
// turns".

import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureCredits, spendCredits, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    ensureCredits: vi.fn(async () => {
      callOrder.push("ensureCredits");
    }),
    spendCredits: vi.fn(async () => {
      callOrder.push("spendCredits");
    }),
  };
});
vi.mock("@/lib/credits", () => ({ ensureCredits, spendCredits }));

const { embedText } = vi.hoisted(() => ({ embedText: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({
  embedText,
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}));

const { executeRaw } = vi.hoisted(() => ({ executeRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: executeRaw },
}));

import { storeMemory } from "@/lib/memory";
import { OpError } from "@/lib/crm-operations";

const USER = "user-1";

describe("storeMemory credit metering (remember)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    executeRaw.mockResolvedValue(undefined);
  });

  it("is free by default (in-app agent auto-save) - no credit calls at all", async () => {
    embedText.mockImplementation(async () => {
      callOrder.push("embedText");
      return [0.1, 0.2];
    });

    const ok = await storeMemory(USER, "message", "operator said hi");

    expect(ok).toBe(true);
    expect(ensureCredits).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("with chargeCredits: gates BEFORE the OpenAI call, then debits remember after a real save", async () => {
    embedText.mockImplementation(async () => {
      callOrder.push("embedText");
      return [0.1, 0.2];
    });

    const ok = await storeMemory(USER, "message", "durable fact", "ref-1", { chargeCredits: true });

    expect(ok).toBe(true);
    expect(ensureCredits).toHaveBeenCalledWith(USER, "remember");
    expect(spendCredits).toHaveBeenCalledWith(USER, "remember", { ref: "ref-1" });
    expect(callOrder).toEqual(["ensureCredits", "embedText", "spendCredits"]);
  });

  it("never charges on a miss - embeddings unavailable", async () => {
    embedText.mockImplementation(async () => {
      callOrder.push("embedText");
      return null;
    });

    const ok = await storeMemory(USER, "message", "durable fact", undefined, { chargeCredits: true });

    expect(ok).toBe(false);
    expect(ensureCredits).toHaveBeenCalledWith(USER, "remember");
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("never charges on a miss - the DB insert fails after embedding succeeded", async () => {
    embedText.mockImplementation(async () => {
      callOrder.push("embedText");
      return [0.1, 0.2];
    });
    executeRaw.mockRejectedValue(new Error("db down"));

    const ok = await storeMemory(USER, "message", "durable fact", undefined, { chargeCredits: true });

    expect(ok).toBe(false);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("blocks with a 402 OpError when the user is out of credits, before any OpenAI spend", async () => {
    ensureCredits.mockImplementation(async () => {
      callOrder.push("ensureCredits");
      throw new OpError("Out of credits. Upgrade your plan or wait for your monthly reset.", 402);
    });

    await expect(
      storeMemory(USER, "message", "durable fact", undefined, { chargeCredits: true }),
    ).rejects.toMatchObject({ name: "OpError", status: 402 });

    expect(embedText).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });
});
