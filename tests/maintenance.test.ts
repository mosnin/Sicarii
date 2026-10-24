// Bounded idempotency cleanup runs from the Stripe webhook. A sampling bug
// would either never delete (tables grow forever) or delete on every delivery
// (adds latency to billing). A missing take-cap would let one handler scan
// unbounded history. Failures must never throw into the request path.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findEvents = vi.fn();
const deleteEvents = vi.fn();
const findKeys = vi.fn();
const deleteKeys = vi.fn();
const findTokens = vi.fn();
const deleteTokens = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    processedEvent: {
      findMany: (...args: unknown[]) => findEvents(...args),
      deleteMany: (...args: unknown[]) => deleteEvents(...args),
    },
    idempotencyKey: {
      findMany: (...args: unknown[]) => findKeys(...args),
      deleteMany: (...args: unknown[]) => deleteKeys(...args),
    },
    revokedToken: {
      findMany: (...args: unknown[]) => findTokens(...args),
      deleteMany: (...args: unknown[]) => deleteTokens(...args),
    },
  },
}));

import { maybeCleanupIdempotency } from "@/lib/maintenance";

async function flushCleanup(): Promise<void> {
  // The cleanup IIFE awaits several prisma calls; drain both microtasks
  // and one macrotask so every mock has settled before we assert.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setImmediate(resolve));
}

describe("maybeCleanupIdempotency sampling", () => {
  beforeEach(() => {
    findEvents.mockReset().mockResolvedValue([]);
    deleteEvents.mockReset().mockResolvedValue({ count: 0 });
    findKeys.mockReset().mockResolvedValue([]);
    deleteKeys.mockReset().mockResolvedValue({ count: 0 });
    findTokens.mockReset().mockResolvedValue([]);
    deleteTokens.mockReset().mockResolvedValue({ count: 0 });
  });

  it("does not query when the last hex nibble is not a sample hit", async () => {
    // last nibble 1: parseInt("1", 16) = 1, 1 % 16 !== 0
    maybeCleanupIdempotency("evt_abc1");
    await flushCleanup();
    expect(findEvents).not.toHaveBeenCalled();
    expect(findKeys).not.toHaveBeenCalled();
    expect(findTokens).not.toHaveBeenCalled();
  });

  it("does not query when the last character is not hex", async () => {
    maybeCleanupIdempotency("evt_abcz");
    await flushCleanup();
    expect(findEvents).not.toHaveBeenCalled();
  });

  it("runs cleanup when the last hex nibble is a sample hit (0)", async () => {
    maybeCleanupIdempotency("evt_abc0");
    await flushCleanup();
    expect(findEvents).toHaveBeenCalledTimes(1);
    expect(findKeys).toHaveBeenCalledTimes(1);
    expect(findTokens).toHaveBeenCalledTimes(1);
  });
});

describe("maybeCleanupIdempotency bounds and side effects", () => {
  beforeEach(() => {
    findEvents.mockReset();
    deleteEvents.mockReset().mockResolvedValue({ count: 0 });
    findKeys.mockReset();
    deleteKeys.mockReset().mockResolvedValue({ count: 0 });
    findTokens.mockReset();
    deleteTokens.mockReset().mockResolvedValue({ count: 0 });
  });

  it("caps each find at 500 and only deletes rows older than 60 days", async () => {
    const before = Date.now();
    findEvents.mockResolvedValue([{ id: "e1" }]);
    findKeys.mockResolvedValue([{ key: "k1" }]);
    findTokens.mockResolvedValue([{ jti: "j1" }]);

    maybeCleanupIdempotency("evt_fff0");
    await flushCleanup();
    const after = Date.now();

    const eventCall = findEvents.mock.calls[0][0] as {
      where: { createdAt: { lt: Date } };
      select: { id: boolean };
      take: number;
    };
    expect(eventCall.take).toBe(500);
    expect(eventCall.select).toEqual({ id: true });
    const cutoffMs = eventCall.where.createdAt.lt.getTime();
    const sixtyDays = 60 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(before - sixtyDays - 50);
    expect(cutoffMs).toBeLessThanOrEqual(after - sixtyDays + 50);
    expect(deleteEvents).toHaveBeenCalledWith({ where: { id: { in: ["e1"] } } });

    const keyCall = findKeys.mock.calls[0][0] as {
      where: { createdAt: { lt: Date } };
      take: number;
    };
    expect(keyCall.take).toBe(500);
    expect(deleteKeys).toHaveBeenCalledWith({ where: { key: { in: ["k1"] } } });

    const tokenCall = findTokens.mock.calls[0][0] as {
      where: { expiresAt: { lt: Date } };
      take: number;
    };
    expect(tokenCall.take).toBe(500);
    expect(tokenCall.where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before - 50);
    expect(tokenCall.where.expiresAt.lt.getTime()).toBeLessThanOrEqual(after + 50);
    expect(deleteTokens).toHaveBeenCalledWith({ where: { jti: { in: ["j1"] } } });
  });

  it("skips deleteMany when a table has no old rows", async () => {
    findEvents.mockResolvedValue([]);
    findKeys.mockResolvedValue([]);
    findTokens.mockResolvedValue([]);

    maybeCleanupIdempotency("evt_aaa0");
    await flushCleanup();

    expect(deleteEvents).not.toHaveBeenCalled();
    expect(deleteKeys).not.toHaveBeenCalled();
    expect(deleteTokens).not.toHaveBeenCalled();
  });

  it("swallows prisma errors and never throws into the caller", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    findEvents.mockRejectedValue(new Error("db down"));

    expect(() => maybeCleanupIdempotency("evt_bbb0")).not.toThrow();
    await flushCleanup();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
