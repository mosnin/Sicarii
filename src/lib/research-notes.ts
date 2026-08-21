// Scheduled research must never destroy a lead.
//
// The Inngest cron comment says a targeted run "merges research into its
// notes". The implementation used to assign `notes: researchNote` and force
// `status: "ENRICHED"`, which wiped manual notes and demoted WON / CONTACTED /
// QUALIFIED / ARCHIVED contacts on every hourly/daily tick. Activity exists
// specifically so the human-summary notes field is not overwritten by agents.

import { prisma } from "@/lib/prisma";

// Matches the REST / MCP notes cap. Existing notes are never truncated to
// make room for research; incoming research is what gets cut if needed.
export const RESEARCH_NOTES_MAX = 10000;

export function mergeResearchNotes(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string {
  const prior = (existing ?? "").trim();
  const next = (incoming ?? "").trim();
  if (!next) return prior;
  if (!prior) return next.slice(0, RESEARCH_NOTES_MAX);
  // Same run / same sources: do not append a duplicate block.
  if (prior.includes(next)) return prior.length > RESEARCH_NOTES_MAX ? prior.slice(0, RESEARCH_NOTES_MAX) : prior;

  const sep = "\n\n";
  const room = RESEARCH_NOTES_MAX - prior.length - sep.length;
  if (room <= 0) return prior.slice(0, RESEARCH_NOTES_MAX);
  return `${prior}${sep}${next.slice(0, room)}`;
}

/** Only a brand-new record is promoted. Later pipeline states stay put. */
export function shouldPromoteToEnriched(status: string | null | undefined): boolean {
  return status === "NEW";
}

export interface ResearchTargetPatch {
  notes?: string;
  status?: "ENRICHED";
}

export function researchTargetPatch(opts: {
  existingNotes: string | null | undefined;
  existingStatus: string | null | undefined;
  researchNote: string | null | undefined;
}): ResearchTargetPatch {
  const incoming = (opts.researchNote ?? "").trim();
  if (!incoming) return {};

  const prior = (opts.existingNotes ?? "").trim();
  const notes = mergeResearchNotes(prior, incoming);
  const patch: ResearchTargetPatch = {};
  if (notes !== prior) patch.notes = notes;
  if (shouldPromoteToEnriched(opts.existingStatus)) patch.status = "ENRICHED";
  return patch;
}

export interface ApplyResearchResult {
  applied: boolean;
  notesMerged: boolean;
  statusPromoted: boolean;
}

/**
 * Apply one scheduled-research result to a contact or entity the caller owns.
 * Scoped by userId. Empty research is a no-op (status is not touched).
 * Writes an Activity for the new research block so history survives even
 * when notes are already at the cap.
 */
export async function applyScheduledResearch(opts: {
  userId: string;
  targetType: "contact" | "entity";
  targetId: string;
  researchNote: string;
}): Promise<ApplyResearchResult> {
  const incoming = opts.researchNote.trim();
  if (!incoming) return { applied: false, notesMerged: false, statusPromoted: false };

  if (opts.targetType === "contact") {
    const existing = await prisma.contact.findFirst({
      where: { id: opts.targetId, userId: opts.userId },
      select: { id: true, notes: true, status: true },
    });
    if (!existing) return { applied: false, notesMerged: false, statusPromoted: false };

    const patch = researchTargetPatch({
      existingNotes: existing.notes,
      existingStatus: existing.status,
      researchNote: incoming,
    });
    const notesMerged = patch.notes !== undefined;
    const statusPromoted = patch.status !== undefined;
    if (notesMerged || statusPromoted) {
      await prisma.contact.update({ where: { id: existing.id }, data: patch });
    }
    if (notesMerged) {
      await prisma.activity.create({
        data: {
          userId: opts.userId,
          contactId: existing.id,
          kind: "note",
          body: incoming.slice(0, RESEARCH_NOTES_MAX),
          actorLabel: "research schedule",
        },
      });
    }
    return { applied: notesMerged || statusPromoted, notesMerged, statusPromoted };
  }

  const existing = await prisma.entity.findFirst({
    where: { id: opts.targetId, userId: opts.userId },
    select: { id: true, notes: true, status: true },
  });
  if (!existing) return { applied: false, notesMerged: false, statusPromoted: false };

  const patch = researchTargetPatch({
    existingNotes: existing.notes,
    existingStatus: existing.status,
    researchNote: incoming,
  });
  const notesMerged = patch.notes !== undefined;
  const statusPromoted = patch.status !== undefined;
  if (notesMerged || statusPromoted) {
    await prisma.entity.update({ where: { id: existing.id }, data: patch });
  }
  if (notesMerged) {
    await prisma.activity.create({
      data: {
        userId: opts.userId,
        entityId: existing.id,
        kind: "note",
        body: incoming.slice(0, RESEARCH_NOTES_MAX),
        actorLabel: "research schedule",
      },
    });
  }
  return { applied: notesMerged || statusPromoted, notesMerged, statusPromoted };
}
