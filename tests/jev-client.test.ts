import { describe, it, expect } from "vitest";
import { createJevClient, JevError } from "@/lib/jev";

describe("createJevClient", () => {
  it("hits native TypeSafe /systemone and normalizes a noul", async () => {
    const client = createJevClient({
      typesafeKey: "ts-test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            model: "jev-latest",
            answers: { urgent: { type: "noul", noul: 0.99 } },
            usage: { input_tokens: 40, output_tokens: 0 },
          }),
          { status: 200 },
        ),
    });

    const result = await client.evaluate({
      state: "help now",
      questions: { urgent: { type: "noul", instructions: "urgent?" } },
    });
    expect(result.provider).toBe("typesafe");
    expect(result.answers.urgent).toEqual({ type: "noul", noul: 0.99 });
    expect(result.usage.inputTokens).toBe(40);
  });

  it("maps AI SDK boolean/probability onto noul", async () => {
    const client = createJevClient({
      gatewayKey: "gw-test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            model: "typesafe-ai/jev",
            answers: { urgent: { type: "boolean", probability: 0.8 } },
          }),
          { status: 200 },
        ),
    });
    const result = await client.evaluate({
      state: "maybe",
      questions: { urgent: { type: "noul", instructions: "urgent?" } },
    });
    expect(result.provider).toBe("gateway");
    expect(result.answers.urgent).toEqual({ type: "noul", noul: 0.8 });
  });

  it("retries 429 then succeeds", async () => {
    let hits = 0;
    const client = createJevClient({
      typesafeKey: "ts-test",
      maxRetries: 2,
      fetchImpl: async () => {
        hits += 1;
        if (hits === 1) return new Response("{}", { status: 429 });
        return new Response(
          JSON.stringify({ model: "jev-latest", answers: { u: { type: "noul", noul: 0.1 } } }),
          { status: 200 },
        );
      },
    });
    const result = await client.evaluate({
      state: "x",
      questions: { u: { type: "noul", instructions: "u" } },
    });
    expect(hits).toBe(2);
    expect(result.answers.u).toEqual({ type: "noul", noul: 0.1 });
  });

  it("throws when no transport is configured", async () => {
    const client = createJevClient({
      typesafeKey: "",
      gatewayKey: "",
      openrouterKey: "",
    });
    await expect(
      client.evaluate({ state: "x", questions: { u: { type: "noul" } } }),
    ).rejects.toBeInstanceOf(JevError);
  });
});
