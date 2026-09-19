import { describe, it, expect } from "vitest";
import { routeIntentWithJev } from "@/lib/jev/route-intent";
import type { JevClient } from "@/lib/jev";
import type { JevResult, QuestionMap } from "@/lib/jev/contract";

function mock(choice: string, confidence: number): JevClient {
  return {
    async evaluate<Q extends QuestionMap>(): Promise<JevResult<Q>> {
      return {
        model: "mock",
        answers: {
          tool: {
            type: "choice",
            choice,
            confidence,
            probabilities: { [choice]: confidence, other: 1 - confidence },
          },
        } as JevResult<Q>["answers"],
        usage: { inputTokens: 1, outputTokens: 0 },
        latencyMs: 1,
        provider: "mock",
      };
    },
  };
}

describe("routeIntentWithJev", () => {
  it("accepts a confident catalog pick and fills params from the heuristic", async () => {
    const routed = await routeIntentWithJev("enrich stripe.com", mock("enrich-domain", 0.92));
    expect(routed.source).toBe("jev");
    expect(routed.toolId).toBe("enrich-domain");
    expect(routed.params.domain).toBe("stripe.com");
  });

  it("falls back to the heuristic when Jev picks an unknown tool", async () => {
    const routed = await routeIntentWithJev("enrich stripe.com", mock("not-a-tool", 0.99));
    expect(routed.source).toBe("heuristic");
    expect(routed.toolId).toBe("enrich-domain");
  });

  it("falls back when confidence is too low", async () => {
    const routed = await routeIntentWithJev("best coffee beans", mock("find-entities", 0.2));
    expect(routed.source).toBe("heuristic");
    expect(routed.toolId).toBe("web-search");
  });
});
