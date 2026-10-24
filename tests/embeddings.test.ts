// Embedding helpers sit on the SQL path: a bad vector literal breaks
// storeMemory/recall, and an empty or unconfigured call must return null
// instead of spending an OpenAI request.
import { describe, it, expect, vi, afterEach } from "vitest";
import { embedText, isEmbeddingConfigured, toVectorLiteral } from "@/lib/embeddings";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isEmbeddingConfigured / embedText", () => {
  it("is off without OPENAI_API_KEY and returns null without calling out", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(isEmbeddingConfigured()).toBe(false);
    await expect(embedText("remember this")).resolves.toBeNull();
  });

  it("returns null for empty or whitespace-only text even when configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(isEmbeddingConfigured()).toBe(true);
    await expect(embedText("")).resolves.toBeNull();
    await expect(embedText("   \n")).resolves.toBeNull();
  });
});

describe("toVectorLiteral", () => {
  it("formats a pgvector literal the SQL cast expects", () => {
    expect(toVectorLiteral([0.1, -0.2, 3])).toBe("[0.1,-0.2,3]");
    expect(toVectorLiteral([])).toBe("[]");
  });
});
