// After an x402 settlement the USDC has already moved. grantAfterSettle must
// retry the off-chain grant and emit a structured CRITICAL log on final
// failure so a paid top-up/plan can never be silently lost. The grant itself
// is idempotent on ref (see tests/credits-idempotency.test.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { grantAfterSettle } from "@/lib/x402";

const ctx = {
  transaction: "0xtx",
  userId: "user-1",
  ref: "x402:nonce-1",
  amount: "1000",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("grantAfterSettle", () => {
  it("returns on the first successful grant and does not retry", async () => {
    const grant = vi.fn().mockResolvedValue(1600);
    await expect(grantAfterSettle(grant, ctx)).resolves.toBe(1600);
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures and returns the eventual grant", async () => {
    const grant = vi
      .fn()
      .mockRejectedValueOnce(new Error("db blip"))
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce(1600);

    const pending = grantAfterSettle(grant, ctx);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(1600);
    expect(grant).toHaveBeenCalledTimes(3);
  });

  it("logs CRITICAL settled_but_uncredited and rethrows after three failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const grant = vi.fn().mockRejectedValue(new Error("still down"));

    const pending = grantAfterSettle(grant, ctx);
    const assertion = expect(pending).rejects.toThrow("still down");
    await vi.runAllTimersAsync();
    await assertion;

    expect(grant).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("[x402] CRITICAL settled_but_uncredited"),
    );
    const line = String(error.mock.calls[0]![0]);
    expect(line).toContain(ctx.transaction);
    expect(line).toContain(ctx.userId);
    expect(line).toContain(ctx.ref);
  });
});
