// Build a customer segment from a prompt: vector-match the closest eligible
// prospects to the goal. Eligibility is strict, never target leads that are not
// enriched, or that have already been reached out to.

import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import { EMBEDDING_MODEL } from "@/lib/embeddings";

export interface SegmentMatch {
  contactId: string;
  score: number;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function contactText(c: {
  name: string | null; title: string | null; company: string | null;
  location: string | null; notes: string | null;
  entity: { name: string | null; industry: string | null; description: string | null } | null;
}): string {
  return [
    c.name, c.title, c.company ?? c.entity?.name, c.entity?.industry, c.location, c.notes, c.entity?.description,
  ].filter(Boolean).join(" - ").slice(0, 800);
}

// Eligible = enriched AND not yet contacted AND not already in a pipeline.
const ELIGIBLE_STATUS = "ENRICHED" as const;

export async function buildSegmentMatches(
  userId: string,
  goal: string,
  quantity: number,
  candidateCap = 200,
): Promise<{ matches: SegmentMatch[]; eligibleCount: number }> {
  // Contacts already in any pipeline are excluded (already being worked).
  const inPipeline = await prisma.pipelineEntry.findMany({
    where: { userId },
    select: { contactId: true },
  });
  const excludeIds = new Set(inPipeline.map((e) => e.contactId));

  const candidates = await prisma.contact.findMany({
    where: {
      userId,
      status: ELIGIBLE_STATUS, // enriched, and ENRICHED means not yet contacted
      ...(excludeIds.size ? { id: { notIn: [...excludeIds] } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: candidateCap,
    include: { entity: { select: { name: true, industry: true, description: true } } },
  });

  if (candidates.length === 0) return { matches: [], eligibleCount: 0 };

  // Embed the goal + every candidate, then rank by cosine similarity.
  const { embedding: goalVec } = await embed({ model: openai.embedding(EMBEDDING_MODEL), value: goal.slice(0, 2000) });
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: candidates.map((c) => contactText(c) || c.name || c.id),
  });

  const ranked = candidates
    .map((c, i) => ({ contactId: c.id, score: cosine(goalVec, embeddings[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(quantity, candidates.length)));

  return { matches: ranked, eligibleCount: candidates.length };
}
