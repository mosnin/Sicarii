import { describe, it, expect } from "vitest";
import { decideFromAnswers } from "@/lib/jev/decide";
import type { Answer } from "@/lib/jev/contract";

function n(p: number): Answer {
  return { type: "noul", noul: p };
}
function c(choice: string, confidence = 0.9, extra: Record<string, number> = {}): Answer {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: confidence, ...extra },
  };
}
function s(score: number, confidence = 0.8): Answer {
  return {
    type: "score",
    score,
    confidence,
    legend: {},
    probabilities: {},
  };
}

describe("decideFromAnswers", () => {
  it("refuses a confident out-of-scope intent", () => {
    expect(
      decideFromAnswers({
        intent: c("out_of_scope", 0.85),
        needsGeneration: n(0.1),
        risk: s(0.2),
        needsHuman: n(0.1),
        destructive: n(0.1),
        exfiltration: n(0.1),
        beyondScope: n(0.1),
        impact: s(0.2),
      }).kind,
    ).toBe("refuse");
  });

  it("escalates a clarify intent", () => {
    const d = decideFromAnswers({
      intent: c("clarify", 0.9),
      needsGeneration: n(0.2),
      risk: s(0.2),
      needsHuman: n(0.1),
      destructive: n(0.1),
      exfiltration: n(0.1),
      beyondScope: n(0.1),
      impact: s(0.2),
    });
    expect(d).toMatchObject({ kind: "escalate", reason: "low_intent_confidence" });
  });

  it("blocks a destructive pending action", () => {
    const d = decideFromAnswers({
      intent: c("mutate", 0.9),
      needsGeneration: n(0.1),
      risk: s(1),
      needsHuman: n(0.2),
      destructive: n(0.95),
      exfiltration: n(0.1),
      beyondScope: n(0.1),
      impact: s(1),
    });
    expect(d).toMatchObject({ kind: "escalate", reason: "guardrail" });
  });

  it("routes a confident tool pick", () => {
    const d = decideFromAnswers({
      intent: c("tool", 0.9),
      needsGeneration: n(0.2),
      risk: s(0.4),
      needsHuman: n(0.1),
      destructive: n(0.1),
      exfiltration: n(0.1),
      beyondScope: n(0.1),
      impact: s(0.3),
      tool: c("find_companies", 0.88, { none: 0.12 }),
    });
    expect(d).toMatchObject({ kind: "tool", tool: "find_companies" });
  });

  it("keeps lookup deterministic when no prose is needed", () => {
    const d = decideFromAnswers({
      intent: c("lookup", 0.9),
      needsGeneration: n(0.2),
      risk: s(0.2),
      needsHuman: n(0.1),
      destructive: n(0.05),
      exfiltration: n(0.05),
      beyondScope: n(0.05),
      impact: s(0.2),
      tool: c("none", 0.8),
    });
    expect(d).toMatchObject({ kind: "deterministic", action: "lookup" });
  });

  it("grants Qwen only when needsGeneration is high", () => {
    const d = decideFromAnswers({
      intent: c("compose", 0.9),
      needsGeneration: n(0.85),
      risk: s(0.4),
      needsHuman: n(0.2),
      destructive: n(0.1),
      exfiltration: n(0.1),
      beyondScope: n(0.1),
      impact: s(0.4),
      tool: c("none", 0.8),
      tier: c("qwen_fast", 0.8),
      effort: c("medium", 0.7),
    });
    expect(d).toMatchObject({ kind: "generate", model: "qwen", effort: "medium" });
  });
});
