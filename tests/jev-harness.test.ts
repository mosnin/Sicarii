import { describe, it, expect } from "vitest";
import { autoMode, routeModel, type JevClient } from "@/lib/jev";
import type { JevResult, QuestionMap } from "@/lib/jev/contract";

function mockClient(answers: JevResult["answers"]): JevClient {
  return {
    async evaluate<Q extends QuestionMap>(req: { questions: Q }): Promise<JevResult<Q>> {
      return {
        model: "mock",
        answers: answers as JevResult<Q>["answers"],
        usage: { inputTokens: 10, outputTokens: 0 },
        latencyMs: 1,
        provider: "mock",
      };
    },
  };
}

describe("routeModel", () => {
  it("pins the Jev winner when confidence clears the route gate", async () => {
    const routed = await routeModel({
      message: "lookup jane at acme",
      client: mockClient({
        model: {
          type: "choice",
          choice: "qwen_fast",
          confidence: 0.9,
          probabilities: { qwen_fast: 0.9, qwen_strong: 0.05, none: 0.05 },
        },
      }),
    });
    expect(routed).toMatchObject({ choice: "qwen_fast", source: "jev" });
  });

  it("falls back when Jev is unconfident", async () => {
    const routed = await routeModel({
      message: "???",
      client: mockClient({
        model: {
          type: "choice",
          choice: "qwen_strong",
          confidence: 0.2,
          probabilities: { qwen_strong: 0.4, qwen_fast: 0.3, none: 0.3 },
        },
      }),
    });
    expect(routed.source).toBe("fallback");
  });
});

describe("autoMode", () => {
  it("blocks a destructive pending tool call", async () => {
    const verdict = await autoMode({
      tool: "update_contact",
      args: { id: "c1", status: "LOST" },
      message: "delete everything",
      client: mockClient({
        destructive: { type: "noul", noul: 0.95 },
        exfiltration: { type: "noul", noul: 0.1 },
        beyondScope: { type: "noul", noul: 0.1 },
        impact: { type: "score", score: 3, confidence: 0.9, legend: {}, probabilities: {} },
      }),
    });
    expect(verdict.action).toBe("block");
    if (verdict.action !== "allow") expect(verdict.reasons).toContain("destructive");
  });

  it("allows when Jev is not configured (fail-open, do not brick writes)", async () => {
    const keys = [
      "TYPESAFE_API_KEY",
      "TYPESAFE_AI_API_KEY",
      "AI_GATEWAY_API_KEY",
      "VERCEL_AI_GATEWAY_API_KEY",
      "OPENROUTER_API_KEY",
    ] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    try {
      const verdict = await autoMode({
        tool: "create_contact",
        args: { name: "Jane" },
        message: "add jane",
      });
      expect(verdict).toEqual({ action: "allow" });
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("asks for confirmation when a live write-tool eval fails", async () => {
    const verdict = await autoMode({
      tool: "create_contact",
      args: { name: "Jane" },
      message: "add jane",
      client: {
        async evaluate() {
          throw new Error("typesafe down");
        },
      },
    });
    expect(verdict).toEqual({ action: "confirm", reasons: ["jev_unavailable"] });
  });

  it("allows when a live read-tool eval fails", async () => {
    const verdict = await autoMode({
      tool: "search_crm",
      args: { query: "acme" },
      message: "find acme",
      client: {
        async evaluate() {
          throw new Error("typesafe down");
        },
      },
    });
    expect(verdict).toEqual({ action: "allow" });
  });

  it("allows a clean read-shaped call", async () => {
    const verdict = await autoMode({
      tool: "search_crm",
      args: { query: "acme" },
      message: "find acme",
      client: mockClient({
        destructive: { type: "noul", noul: 0.05 },
        exfiltration: { type: "noul", noul: 0.05 },
        beyondScope: { type: "noul", noul: 0.05 },
        impact: { type: "score", score: 0.2, confidence: 0.8, legend: {}, probabilities: {} },
      }),
    });
    expect(verdict).toEqual({ action: "allow" });
  });
});
