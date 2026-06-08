/**
 * Rate limiter. Durable across serverless instances when Upstash Redis is
 * configured (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN); otherwise it
 * falls back to a per-instance in-memory limiter. The in-memory path is fine for
 * local dev but weak in production (each serverless instance has its own map) -
 * which is exactly why the durable backend is preferred. On any Redis error we
 * fail OPEN to the in-memory limiter, so a Redis blip never 500s the app.
 */

import { Redis } from "@upstash/redis";

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/* ------------------------- In-memory fallback ------------------------- */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Clean up old entries every 60s.
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap) {
      if (value.resetAt < now) rateLimitMap.delete(key);
    }
  }, 60_000).unref?.();
}

function memoryCheck(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > limit) return { success: false, remaining: 0, resetAt: entry.resetAt };
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/* ------------------------- Durable backend (Upstash) ------------------------- */

const redis: Redis | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
})();

/** True when the durable (cross-instance) limiter is active. */
export function isDurableRateLimit(): boolean {
  return redis !== null;
}

/**
 * Check and consume one unit against `key` within a fixed `windowMs` window.
 * Durable (shared across instances) when Upstash is configured.
 * @param key - bucket id (e.g. `agent:${userId}` or `oauth-register:${ip}`)
 * @param limit - max units per window
 * @param windowMs - window length in ms (default 60s)
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  if (!redis) return memoryCheck(key, limit, windowMs);

  // Fixed window: one counter per (key, time-slot), expiring at the window end.
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const slot = Math.floor(Date.now() / windowMs);
  const bucket = `rl:${key}:${slot}`;
  const resetAt = (slot + 1) * windowMs;
  try {
    const count = await redis.incr(bucket);
    // Set the TTL on EVERY request, not just the first. If a prior EXPIRE was
    // lost (process died / network blip after INCR created the key), the key
    // would otherwise live forever and lock the bucket at 429 permanently.
    await redis.expire(bucket, windowSec);
    if (count > limit) return { success: false, remaining: 0, resetAt };
    return { success: true, remaining: limit - count, resetAt };
  } catch {
    // Redis unreachable - fail open to the in-memory limiter rather than erroring.
    return memoryCheck(key, limit, windowMs);
  }
}
