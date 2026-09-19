import { describe, it, expect } from "vitest";
import { factoryPolicy, DEFAULT_FACTORY_CONFIG, exactCodeChecks, reviewVerdict } from "@/lib/symbolic";
import { wardenBlock } from "@/lib/company-os";
import { pageGrade } from "@/lib/jev/packs/scoring";
import { sweepNoulThreshold } from "@/lib/jev/eval/validate";

describe("factoryPolicy (Foreman)", () => {
  const quiet = {
    implementationComplete: 0.2,
    testsSufficient: 0.2,
    requirementsSatisfied: 0.2,
    needsVerification: 0.2,
    meaningfulProgress: 0.8,
    workerStuck: 0.1,
    workOffTrack: 0.1,
    readyToFinish: 0.2,
    needsHuman: 0.1,
  };

  it("escalates when a human is needed", () => {
    expect(
      factoryPolicy({ active: true, verified: false, verifyStarted: false, iteration: 1, maxIterations: 8 }, {
        ...quiet,
        needsHuman: 0.9,
      }),
    ).toBe("ESCALATE");
  });

  it("finishes only when all three finish nouls clear", () => {
    expect(
      factoryPolicy(
        { active: false, verified: true, verifyStarted: true, iteration: 3, maxIterations: 8 },
        {
          ...quiet,
          readyToFinish: 0.9,
          requirementsSatisfied: 0.9,
          testsSufficient: 0.9,
        },
        DEFAULT_FACTORY_CONFIG,
      ),
    ).toBe("FINISH");
  });

  it("starts a worker when idle and unfinished", () => {
    expect(
      factoryPolicy(
        { active: false, verified: false, verifyStarted: false, iteration: 0, maxIterations: 8 },
        quiet,
      ),
    ).toBe("START_WORKER");
  });
});

describe("exactCodeChecks (jev-code)", () => {
  it("flags skipped tests and deleted asserts", () => {
    const diff = `
- expect(user.id).toBeDefined()
+ it.skip("later", () => {})
`;
    const notes = exactCodeChecks(diff).map((f) => f.note);
    expect(notes.some((n) => /Skipped tests/.test(n))).toBe(true);
    expect(notes.some((n) => /Assertions were deleted/.test(n))).toBe(true);
  });
});

describe("reviewVerdict", () => {
  it("blocks on security even at modest severity", () => {
    const v = reviewVerdict(0.4, { security: 0.8, correctness: 0.1 });
    expect(v.blocking).toBe(true);
    expect(v.findings).toContain("security");
  });
});

describe("wardenBlock", () => {
  it("blocks when a pack fires", () => {
    expect(wardenBlock({ "pii-review": 0.9 }).allow).toBe(false);
    expect(wardenBlock({ "outbound-tone": 0.1 }).allow).toBe(true);
  });
});

describe("pageGrade", () => {
  it("returns a letter from section scores", () => {
    const perfect: Record<string, { type: string; score: number }> = {};
    for (const k of [
      "clarity",
      "concision",
      "specificity",
      "explanation",
      "usefulness",
      "readability",
      "coherence",
      "credibility",
      "mechanics",
      "intent",
    ]) {
      perfect[k] = { type: "score", score: 4 };
    }
    expect(pageGrade(perfect)).toEqual({ score: 100, grade: "A" });
  });
});

describe("sweepNoulThreshold", () => {
  it("finds a threshold that holds target accuracy", () => {
    const rows = [
      { p: 0.95, gold: true },
      { p: 0.9, gold: true },
      { p: 0.1, gold: false },
      { p: 0.05, gold: false },
      { p: 0.55, gold: false },
    ];
    const report = sweepNoulThreshold("urgent", rows, 0.9);
    expect(report.acceptedAcc).toBeGreaterThanOrEqual(0.9);
    expect(report.threshold).toBeGreaterThanOrEqual(0.5);
  });
});
