import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateCacheKey,
  isJevCircuitOpen,
  readEvaluateCache,
  recordJevFailure,
  recordJevSuccess,
  resetJevRuntime,
  writeEvaluateCache,
} from "@/lib/jev/runtime";

describe("jev runtime", () => {
  beforeEach(() => resetJevRuntime());

  it("opens the circuit after a burst of failures", () => {
    const t0 = 1_000_000;
    recordJevFailure(t0);
    recordJevFailure(t0 + 10);
    expect(isJevCircuitOpen(t0 + 20)).toBe(false);
    recordJevFailure(t0 + 20);
    expect(isJevCircuitOpen(t0 + 30)).toBe(true);
    expect(isJevCircuitOpen(t0 + 20_030)).toBe(false);
  });

  it("clears the circuit on success", () => {
    const t0 = 2_000_000;
    recordJevFailure(t0);
    recordJevFailure(t0 + 1);
    recordJevFailure(t0 + 2);
    expect(isJevCircuitOpen(t0 + 3)).toBe(true);
    recordJevSuccess();
    expect(isJevCircuitOpen(t0 + 4)).toBe(false);
  });

  it("returns a fresh cache hit and drops a stale one", () => {
    const key = evaluateCacheKey({ a: 1 }, { u: { type: "noul", instructions: "u" } });
    const result = {
      model: "mock",
      answers: { u: { type: "noul" as const, noul: 0.9 } },
      usage: { inputTokens: 1, outputTokens: 0 },
      latencyMs: 1,
      provider: "mock" as const,
    };
    writeEvaluateCache(key, result, 10);
    expect(readEvaluateCache(key, 20)?.answers.u).toEqual({ type: "noul", noul: 0.9 });
    expect(readEvaluateCache(key, 50_000)).toBeNull();
  });
});
