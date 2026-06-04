// Embeddings for the agent's vector memory. Gated by OPENAI_API_KEY so the app
// builds and runs (without long-term recall) until the key is set.

import { embed } from "ai";
import { openai } from "@ai-sdk/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims
export const EMBEDDING_DIMS = 1536;

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Embed a single string, or null if embeddings aren't configured / on failure. */
export async function embedText(text: string): Promise<number[] | null> {
  if (!isEmbeddingConfigured()) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_MODEL),
      value: trimmed.slice(0, 8000),
    });
    return embedding;
  } catch (e) {
    console.error("embedText failed", e);
    return null;
  }
}

/** Format a JS number[] as a pgvector literal: "[0.1,0.2,...]". */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
