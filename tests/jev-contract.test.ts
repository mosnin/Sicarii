import { describe, it, expect } from "vitest";
import {
  noul,
  choice,
  score,
  validateQuestions,
  validateAnswers,
  gateChoice,
  gateNoul,
  scoreToHundred,
  compactState,
  JevError,
} from "@/lib/jev/contract";

describe("validateQuestions", () => {
  it("rejects an empty map", () => {
    expect(() => validateQuestions({})).toThrow(JevError);
  });

  it("rejects a choice with one option", () => {
    expect(() =>
      validateQuestions({ t: choice("pick", { only: "one" }) }),
    ).toThrow(/2-255/);
  });

  it("rejects a score with one level", () => {
    expect(() => validateQuestions({ t: score("rate", ["only"]) })).toThrow(/2-10/);
  });

  it("accepts a mixed legal map", () => {
    expect(() =>
      validateQuestions({
        u: noul("urgent?"),
        t: choice("team", { billing: "pay", other: null }),
        s: score("sev", ["low", "high"]),
      }),
    ).not.toThrow();
  });
});

describe("validateAnswers", () => {
  const qs = {
    u: noul("urgent?"),
    t: choice("team", { billing: "pay", other: null }),
  };

  it("rejects a missing answer", () => {
    expect(() =>
      validateAnswers(qs, { u: { type: "noul", noul: 0.9 } }),
    ).toThrow(/Missing answer/);
  });

  it("rejects a noul outside [0,1]", () => {
    expect(() =>
      validateAnswers(
        { u: noul("u") },
        { u: { type: "noul", noul: 1.4 } },
      ),
    ).toThrow(/\[0, 1\]/);
  });

  it("accepts a well-formed pair", () => {
    expect(() =>
      validateAnswers(qs, {
        u: { type: "noul", noul: 0.9 },
        t: {
          type: "choice",
          choice: "billing",
          probabilities: { billing: 0.8, other: 0.2 },
          confidence: 0.7,
        },
      }),
    ).not.toThrow();
  });
});

describe("gates", () => {
  it("refuses a low-confidence choice", () => {
    expect(
      gateChoice(
        {
          type: "choice",
          choice: "a",
          probabilities: { a: 0.51, b: 0.49 },
          confidence: 0.2,
        },
        { refuseBelow: 0.5, autoAt: 0.7 },
      ),
    ).toBe("refuse");
  });

  it("autos a peaked choice", () => {
    expect(
      gateChoice(
        {
          type: "choice",
          choice: "a",
          probabilities: { a: 0.92, b: 0.08 },
          confidence: 0.88,
        },
        { refuseBelow: 0.5, autoAt: 0.7 },
      ),
    ).toBe("auto");
  });

  it("treats noul 0.5 as uncertain", () => {
    expect(gateNoul(0.5, 0.8)).toBe("uncertain");
    expect(gateNoul(0.91, 0.8)).toBe("yes");
    expect(gateNoul(0.05, 0.8)).toBe("no");
  });
});

describe("scoreToHundred", () => {
  it("maps a 5-level expected score onto 0-100", () => {
    expect(
      scoreToHundred({
        type: "score",
        score: 4,
        legend: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
        probabilities: { "4": 1 },
        confidence: 1,
      }),
    ).toBe(100);
  });
});

describe("compactState", () => {
  it("leaves small state alone", () => {
    expect(compactState({ a: 1 })).toEqual({ a: 1 });
  });

  it("truncates oversized strings", () => {
    const out = compactState("x".repeat(100), 20);
    expect(typeof out === "string" && out.length).toBe(20);
  });
});
