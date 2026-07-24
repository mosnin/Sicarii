// Shared, userId-scoped operations for Field (segments + pipelines). Used by the
// MCP server so agents can build segments, work pipelines, and read metrics with
// the same behavior as the app.

import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import { buildSegmentMatches } from "@/lib/segment-build";
import { ensureCredits, spendCredits } from "@/lib/credits";

const STAGES = ["NEW", "ENRICHED", "PROSPECTING", "ENGAGING", "REPLYING", "WON", "LOST"] as const;
const CONVO = ["OPEN", "AWAITING_REPLY", "STALLED", "CLOSED"] as const;
type Stage = (typeof STAGES)[number];
type Convo = (typeof CONVO)[number];

/* ----------------------------- Segments ----------------------------- */

export function listSegments(userId: string) {
  return prisma.segment.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function getSegment(userId: string, id: string) {
  const segment = await prisma.segment.findUnique({
    where: { id },
    include: { members: { include: { contact: { select: { id: true, name: true, email: true, company: true, title: true } } } } },
  });
  if (!segment || segment.userId !== userId) throw new OpError("Segment not found", 404);
  return segment;
}

export async function createSegment(userId: string, input: { name: string; goal?: string; contactIds?: string[] }) {
  if (!input.name?.trim()) throw new OpError("Segment name is required", 400);
  const segment = await prisma.segment.create({ data: { userId, name: input.name.trim(), goal: input.goal, source: "manual" } });
  if (input.contactIds?.length) {
    const owned = await prisma.contact.findMany({ where: { userId, id: { in: input.contactIds } }, select: { id: true } });
    await prisma.contactSegment.createMany({
      data: owned.map((c) => ({ segmentId: segment.id, contactId: c.id })),
      skipDuplicates: true,
    });
  }
  return segment;
}

export async function updateSegment(userId: string, id: string, patch: { name?: string; goal?: string }) {
  const existing = await prisma.segment.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new OpError("Segment not found", 404);
  if (patch.name !== undefined && !patch.name.trim()) throw new OpError("Segment name cannot be empty", 400);
  return prisma.segment.update({
    where: { id },
    data: { ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.goal !== undefined ? { goal: patch.goal } : {}) },
  });
}

// ContactSegment.segment is onDelete: Cascade in the schema, so deleting the
// segment row cleans up its membership join rows automatically; no explicit
// member cleanup needed here.
export async function deleteSegment(userId: string, id: string) {
  const existing = await prisma.segment.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new OpError("Segment not found", 404);
  await prisma.segment.delete({ where: { id } });
  return { ok: true };
}

export async function removeSegmentMember(userId: string, segmentId: string, contactId: string) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (!segment || segment.userId !== userId) throw new OpError("Segment not found", 404);
  await prisma.contactSegment.deleteMany({ where: { segmentId, contactId } });
  return { ok: true };
}

// Smart segment: vector-match the closest eligible prospects to a goal.
// Embeds up to ~200 candidate contacts plus the goal via OpenAI in one call
// (see buildSegmentMatches / src/lib/segment-build.ts) - gate on credits
// BEFORE that paid call, and debit only after a segment was actually built,
// so a genuine miss (no eligible prospects, nothing matched) is never
// charged. See CREDIT_COSTS.build_segment in src/lib/credits.ts for the cost
// derivation.
export async function buildSmartSegment(userId: string, input: { goal: string; quantity?: number; name?: string }) {
  if (!input.goal?.trim()) throw new OpError("Describe the segment goal", 400);
  if (!process.env.OPENAI_API_KEY) throw new OpError("Segment building needs OPENAI_API_KEY", 501);
  const quantity = Math.min(Math.max(input.quantity ?? 20, 1), 100);

  await ensureCredits(userId, "build_segment");

  const { matches, eligibleCount } = await buildSegmentMatches(userId, input.goal, quantity);
  if (eligibleCount === 0) throw new OpError("No eligible prospects (segments only target enriched, not-yet-contacted leads)", 422);
  if (matches.length === 0) throw new OpError("Couldn't match any prospects to that goal", 422);

  const segment = await prisma.segment.create({
    data: { userId, name: input.name || input.goal.slice(0, 80), goal: input.goal, source: "prompt" },
  });
  await prisma.contactSegment.createMany({
    data: matches.map((m) => ({ segmentId: segment.id, contactId: m.contactId, score: m.score })),
    skipDuplicates: true,
  });

  // Debit only now - a real segment with real matches was built.
  await spendCredits(userId, "build_segment");

  return { segment, matched: matches.length, eligible: eligibleCount };
}

/* ----------------------------- Pipelines ---------------------------- */

export function listPipelines(userId: string) {
  return prisma.pipeline.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
}

export async function getPipeline(userId: string, id: string) {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
        include: { contact: { select: { id: true, name: true, email: true, title: true, company: true } } },
      },
    },
  });
  if (!pipeline || pipeline.userId !== userId) throw new OpError("Pipeline not found", 404);
  return pipeline;
}

export async function createPipeline(userId: string, input: { name: string; goal?: string; segmentId?: string }) {
  if (!input.name?.trim()) throw new OpError("Pipeline name is required", 400);
  const pipeline = await prisma.pipeline.create({ data: { userId, name: input.name.trim(), goal: input.goal } });
  if (input.segmentId) await addToPipeline(userId, pipeline.id, { segmentId: input.segmentId });
  return pipeline;
}

export async function addToPipeline(userId: string, pipelineId: string, input: { contactIds?: string[]; segmentId?: string }) {
  const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline || pipeline.userId !== userId) throw new OpError("Pipeline not found", 404);

  let ids = input.contactIds ?? [];
  if (input.segmentId) {
    const seg = await prisma.segment.findUnique({ where: { id: input.segmentId }, include: { members: { select: { contactId: true } } } });
    if (seg && seg.userId === userId) ids = [...ids, ...seg.members.map((m) => m.contactId)];
  }
  if (ids.length === 0) throw new OpError("No contacts to add", 400);

  const owned = await prisma.contact.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
  const res = await prisma.pipelineEntry.createMany({
    data: owned.map((c) => ({ userId, pipelineId, contactId: c.id })),
    skipDuplicates: true,
  });
  return { added: res.count };
}

// PipelineEntry.pipeline is onDelete: Cascade in the schema, so deleting the
// pipeline row cleans up its entries automatically; no explicit entry cleanup
// needed here.
export async function deletePipeline(userId: string, id: string) {
  const existing = await prisma.pipeline.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new OpError("Pipeline not found", 404);
  await prisma.pipeline.delete({ where: { id } });
  return { ok: true };
}

export async function removePipelineEntry(userId: string, pipelineId: string, entryId: string) {
  const entry = await prisma.pipelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== userId || entry.pipelineId !== pipelineId) throw new OpError("Entry not found", 404);
  await prisma.pipelineEntry.delete({ where: { id: entryId } });
  return { ok: true };
}

export async function updatePipelineEntry(
  userId: string,
  pipelineId: string,
  entryId: string,
  patch: { stage?: Stage; dealScore?: number | null; conversationStatus?: Convo },
) {
  const entry = await prisma.pipelineEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== userId || entry.pipelineId !== pipelineId) throw new OpError("Entry not found", 404);
  if (patch.stage && !STAGES.includes(patch.stage)) throw new OpError("Invalid stage", 400);
  if (patch.conversationStatus && !CONVO.includes(patch.conversationStatus)) throw new OpError("Invalid conversation status", 400);
  if (patch.dealScore != null && (patch.dealScore < 0 || patch.dealScore > 100)) throw new OpError("dealScore must be 0-100", 400);

  return prisma.pipelineEntry.update({
    where: { id: entryId },
    data: { ...patch, lastActivityAt: new Date() },
  });
}

// Progress metrics across a pipeline.
export async function pipelineMetrics(userId: string, pipelineId: string) {
  const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline || pipeline.userId !== userId) throw new OpError("Pipeline not found", 404);

  const entries = await prisma.pipelineEntry.findMany({
    where: { userId, pipelineId },
    select: { stage: true, dealScore: true, conversationStatus: true },
  });

  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  const byConversation = Object.fromEntries(CONVO.map((c) => [c, 0])) as Record<Convo, number>;
  let scoreSum = 0, scored = 0;
  for (const e of entries) {
    byStage[e.stage as Stage]++;
    byConversation[e.conversationStatus as Convo]++;
    if (e.dealScore != null) { scoreSum += e.dealScore; scored++; }
  }
  return {
    name: pipeline.name,
    objective: pipeline.goal,
    total: entries.length,
    byStage,
    byConversation,
    won: byStage.WON,
    lost: byStage.LOST,
    avgDealScore: scored ? Math.round(scoreSum / scored) : null,
    scored,
    openConversations: entries.length - byConversation.CLOSED,
  };
}
