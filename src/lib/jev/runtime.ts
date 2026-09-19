// Process-local Jev runtime: evaluate memo + circuit breaker.
// When TypeSafe is down, stacked 2.5s retries make the agent feel worse
// than no Jev at all. Trip after a burst of failures and skip the hop
// until it cools. Injected clients (tests) do not touch this state.

import type { Json, JevResult, QuestionMap } from "./contract";
import { compactState } from "./contract";

const CIRCUIT_FAILS = 3;
const CIRCUIT_WINDOW_MS = 15_000;
const CIRCUIT_OPEN_MS = 20_000;
const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 64;

let failTimes: number[] = [];
let openedAt = 0;
const cache = new Map<string, { at: number; result: JevResult }>();

export function evaluateCacheKey(state: Json, questions: QuestionMap): string {
  return JSON.stringify({
    state: compactState(state),
    q: Object.keys(questions).sort(),
  });
}

export function isJevCircuitOpen(now = Date.now()): boolean {
  return openedAt > 0 && now - openedAt < CIRCUIT_OPEN_MS;
}

export function recordJevSuccess(): void {
  failTimes = [];
  openedAt = 0;
}

export function recordJevFailure(now = Date.now()): void {
  failTimes = failTimes.filter((t) => now - t < CIRCUIT_WINDOW_MS);
  failTimes.push(now);
  if (failTimes.length >= CIRCUIT_FAILS) openedAt = now;
}

export function readEvaluateCache(key: string, now = Date.now()): JevResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

export function writeEvaluateCache(key: string, result: JevResult, now = Date.now()): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { at: now, result });
}

export function resetJevRuntime(): void {
  failTimes = [];
  openedAt = 0;
  cache.clear();
}
