// In-memory rate limiter behavior. No UPSTASH env vars are set in the test
// environment, so checkRateLimit takes the per-instance in-memory path.
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, isDurableRateLimit } from "@/lib/rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit (in-memory path)", () => {
  it("uses the in-memory limiter when Upstash is not configured", () => {
    expect(isDurableRateLimit()).toBe(false);
  });

  it("allows requests up to the limit, then blocks with remaining 0", async () => {
    const key = `t:limit:${Date.now()}`;
    const limit = 3;

    for (let i = 1; i <= limit; i++) {
      const res = await checkRateLimit(key, limit, 60_000);
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(limit - i);
    }

    const blocked = await checkRateLimit(key, limit, 60_000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);

    // Still blocked on subsequent calls within the same window.
    const stillBlocked = await checkRateLimit(key, limit, 60_000);
    expect(stillBlocked.success).toBe(false);
    expect(stillBlocked.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    const a = `t:a:${Date.now()}`;
    const b = `t:b:${Date.now()}`;

    await checkRateLimit(a, 1, 60_000);
    const aBlocked = await checkRateLimit(a, 1, 60_000);
    expect(aBlocked.success).toBe(false);

    // Key b is untouched by a's consumption.
    const bFirst = await checkRateLimit(b, 1, 60_000);
    expect(bFirst.success).toBe(true);
    expect(bFirst.remaining).toBe(0);
  });

  it("resets in a new window after expiry", async () => {
    vi.useFakeTimers();
    const key = "t:window";
    const windowMs = 10_000;

    const first = await checkRateLimit(key, 1, windowMs);
    expect(first.success).toBe(true);
    const blocked = await checkRateLimit(key, 1, windowMs);
    expect(blocked.success).toBe(false);

    // Advance past the window; the next check starts a fresh window.
    // The module's setInterval cleanup timer also fires under fake timers,
    // which is fine: it only deletes already-expired entries.
    vi.advanceTimersByTime(windowMs + 1);

    const fresh = await checkRateLimit(key, 1, windowMs);
    expect(fresh.success).toBe(true);
    expect(fresh.remaining).toBe(0);
  });

  it("reports a resetAt at the end of the current window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const res = await checkRateLimit("t:resetAt", 5, 30_000);
    expect(res.resetAt).toBe(1_000_000 + 30_000);
  });
});
