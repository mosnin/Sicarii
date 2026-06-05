// Vector memory for the agent. Stores embedded snippets (past messages + CRM
// data) and recalls them by similarity, so the prompt stays small while memory
// stays deep. All raw SQL goes through pgvector; everything is userId-scoped.
//
// No-ops gracefully when embeddings aren't configured (no OPENAI_API_KEY): the
// agent still works, just without long-term recall.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

export type MemoryKind = "message" | "entity" | "contact" | "email";

/** Embed and store a snippet of memory for a user. Best-effort. */
export async function storeMemory(
  userId: string,
  kind: MemoryKind,
  content: string,
  refId?: string,
): Promise<void> {
  const embedding = await embedText(content);
  if (!embedding) return;
  const id = randomUUID();
  const literal = toVectorLiteral(embedding);
  try {
    await prisma.$executeRaw`
      INSERT INTO memory_chunks (id, "userId", kind, "refId", content, embedding, "createdAt")
      VALUES (${id}, ${userId}, ${kind}, ${refId ?? null}, ${content}, ${literal}::vector, now())
    `;
  } catch (e) {
    console.error("storeMemory failed", e);
  }
}

export interface RecalledChunk {
  kind: string;
  refId: string | null;
  content: string;
  score: number;
}

/** Recall the top-k most similar memory snippets for a user's query. */
export async function recallMemory(
  userId: string,
  query: string,
  k = 6,
): Promise<RecalledChunk[]> {
  const embedding = await embedText(query);
  if (!embedding) return [];
  const literal = toVectorLiteral(embedding);
  try {
    const rows = await prisma.$queryRaw<RecalledChunk[]>`
      SELECT kind, "refId", content,
             1 - (embedding <=> ${literal}::vector) AS score
      FROM memory_chunks
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${k}
    `;
    return rows;
  } catch (e) {
    console.error("recallMemory failed", e);
    return [];
  }
}
