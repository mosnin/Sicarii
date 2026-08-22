// Self-optimizing outreach: a multi-armed bandit over subject-line/opener
// variants, converging on the reply-rate winner per segment without a human
// ever configuring an A/B test. The selection math lives in variant-bandit.ts
// (pure, unit-tested); this module is the userId-scoped ops layer - same
// userId-first + OpError ownership-check convention as crm-operations.ts and
// field-operations.ts - that reads candidates from the CRM, records sends,
// and attributes replies.
//
// Attribution model: a VariantSend join row (variantId, contactId, sentAt,
// replied) rather than a variantId column on Activity. Activity is a
// polymorphic, multi-kind log (note/call/outreach/reply/status_change) shared
// by contacts AND entities; bolting bandit bookkeeping onto it would mean
// filtering that general log by kind/channel just to find "the most recent
// unreplied send to this contact," and there is no natural place to flip a
// "replied" flag on a past Activity row without also touching its meaning
// elsewhere. A dedicated join keeps attribution a single indexed query
// (contactId + replied, ordered by sentAt) with an obvious, race-safe
// terminal state (replied flips once), and never entangles the bandit with
// the human-facing activity trail.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import { selectByThompsonSampling, type VariantArm, type Rng } from "@/lib/variant-bandit";

export type VariantKind = "SUBJECT" | "OPENER";
const VARIANT_KINDS: readonly VariantKind[] = ["SUBJECT", "OPENER"];

export interface VariantInput {
  kind: VariantKind;
  text: string;
  segmentId?: string | null;
}

async function assertSegmentOwned(userId: string, segmentId: string): Promise<void> {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (!segment || segment.userId !== userId) throw new OpError("Invalid segment", 400);
}

/** Verify a variant belongs to `userId`. Used by logOutreach/saveSocialMessage
 *  before recording a send against a caller-supplied variantId, so an agent
 *  can never rack up sends (or later, replies) against another tenant's
 *  variant. */
export async function assertVariantOwned(userId: string, variantId: string): Promise<void> {
  const variant = await prisma.outreachVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.userId !== userId) throw new OpError("Invalid variant", 400);
}

/** Create a subject-line or opener text variant, optionally scoped to a
 *  segment (omit segmentId for a general-purpose variant used outside any
 *  segment). Starts at 0 sends / 0 replies - the bandit explores it exactly
 *  like every other variant in its pool from the first selection onward. */
export async function createVariant(userId: string, input: VariantInput) {
  if (!VARIANT_KINDS.includes(input.kind)) throw new OpError("kind must be SUBJECT or OPENER", 400);
  if (!input.text?.trim()) throw new OpError("text is required", 400);
  if (input.segmentId) await assertSegmentOwned(userId, input.segmentId);
  return prisma.outreachVariant.create({
    data: {
      userId,
      segmentId: input.segmentId ?? null,
      kind: input.kind,
      text: input.text.trim(),
    },
  });
}

/**
 * The bandit's pick for the next outreach in this (segment, kind) pool:
 * Thompson-samples over every ACTIVE variant's Beta(replies+1,
 * sends-replies+1) posterior and returns the highest draw (see
 * variant-bandit.ts for the math). segmentId is matched exactly - omitting it
 * selects from the general (no-segment) pool, not "any segment" - so each
 * segment (and the general pool) runs its own independent bandit, matching
 * how selectVariant is meant to be called: once per segment being worked.
 *
 * Throws a clear OpError when the pool is empty so an agent knows to
 * create_variant first, rather than silently returning nothing to send.
 */
export async function selectVariant(
  userId: string,
  input: { kind: VariantKind; segmentId?: string | null },
  rng?: Rng,
) {
  const candidates = await prisma.outreachVariant.findMany({
    where: {
      userId,
      kind: input.kind,
      segmentId: input.segmentId ?? null,
      active: true,
    },
    select: { id: true, text: true, kind: true, segmentId: true, sends: true, replies: true },
  });
  if (candidates.length === 0) {
    throw new OpError(
      `No active ${input.kind.toLowerCase()} variants${input.segmentId ? " for this segment" : ""}. Call create_variant first.`,
      404,
    );
  }
  const arms: VariantArm[] = candidates.map((c) => ({ id: c.id, sends: c.sends, replies: c.replies }));
  const pickedId = selectByThompsonSampling(arms, rng);
  return candidates.find((c) => c.id === pickedId)!;
}

/**
 * Reply rate + bandit status for every variant, grouped by (segmentId, kind)
 * so the UI can show "which is winning" within exactly the pool
 * selectVariant draws from. `winning` marks the highest reply-rate variant in
 * its group among variants with at least one send (a 0-send variant cannot be
 * a winner yet - it just hasn't been tried).
 */
export async function listVariantStats(userId: string, opts: { segmentId?: string | null } = {}) {
  const variants = await prisma.outreachVariant.findMany({
    where: { userId, ...(opts.segmentId !== undefined ? { segmentId: opts.segmentId } : {}) },
    orderBy: [{ segmentId: "asc" }, { kind: "asc" }, { updatedAt: "desc" }],
  });

  const withRate = variants.map((v) => ({
    ...v,
    replyRate: v.sends > 0 ? v.replies / v.sends : 0,
  }));

  // groupKey -> id of the current highest-reply-rate variant with sends > 0.
  const winnerByGroup = new Map<string, { id: string; replyRate: number }>();
  for (const v of withRate) {
    if (v.sends === 0) continue;
    const key = `${v.segmentId ?? "none"}:${v.kind}`;
    const current = winnerByGroup.get(key);
    if (!current || v.replyRate > current.replyRate) winnerByGroup.set(key, { id: v.id, replyRate: v.replyRate });
  }

  return withRate.map((v) => ({
    ...v,
    winning: winnerByGroup.get(`${v.segmentId ?? "none"}:${v.kind}`)?.id === v.id,
  }));
}

/**
 * Attribute an inbound reply from `contactId` to the most-recent unreplied
 * outbound send for that contact, incrementing that variant's reply count
 * exactly once. A single atomic UPDATE ... WHERE id = (SELECT ... LIMIT 1)
 * closes the race a separate read-then-write would leave open: Postgres
 * row-locks the targeted send row, so a second concurrent reply's subquery
 * re-evaluates against replied = true and finds nothing left to update -
 * the same "conditional atomic update, zero rows means already handled"
 * shape as spendCredits' balance-guarded decrement in credits.ts.
 *
 * No-op when there is no unreplied send (the contact was never sent a
 * variant, or every send is already attributed) - reply detection must never
 * fail just because there's nothing to attribute.
 */
export async function attributeReply(contactId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ variantId: string }[]>(Prisma.sql`
    UPDATE variant_sends
    SET replied = true, "repliedAt" = NOW()
    WHERE id = (
      SELECT id FROM variant_sends
      WHERE "contactId" = ${contactId} AND replied = false
      ORDER BY "sentAt" DESC
      LIMIT 1
    )
    RETURNING "variantId"
  `);
  const variantId = rows[0]?.variantId;
  if (!variantId) return;
  await prisma.outreachVariant.update({
    where: { id: variantId },
    data: { replies: { increment: 1 } },
  });
}
