// First-class lead organization on the existing Contact model.
//
// Contacts already carry status / source / tags, plus Segment and Pipeline
// relations. This module is the single where-builder so list filters stay
// identical across REST, MCP, the in-app agent, and the CRM page. It does
// not invent a second CRM: every filter is a field (or join) on Contact,
// and every query still requires userId.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";

export const CONTACT_STATUSES = [
  "NEW",
  "ENRICHED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
  "ARCHIVED",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const PIPELINE_STAGES = [
  "NEW",
  "ENRICHED",
  "PROSPECTING",
  "ENGAGING",
  "REPLYING",
  "WON",
  "LOST",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ContactListFilters = {
  q?: string | null;
  status?: string | null;
  source?: string | null;
  tag?: string | null;
  list?: string | null;
  ownerId?: string | null;
  segmentId?: string | null;
  pipelineId?: string | null;
  stage?: string | null;
};

function clean(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isContactStatus(value: string): value is ContactStatus {
  return (CONTACT_STATUSES as readonly string[]).includes(value);
}

function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

/** Normalize a list name for write. undefined = leave unchanged; null/blank = clear. */
export function normalizeList(list?: string | null): string | null | undefined {
  if (list === undefined) return undefined;
  if (list === null) return null;
  const trimmed = list.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

/**
 * Tenant-scoped where clause for listing contacts. userId is always set;
 * unknown enum values are ignored rather than matching the wrong rows.
 */
export function contactListWhere(
  userId: string,
  filters: ContactListFilters = {},
): Prisma.ContactWhereInput {
  const q = clean(filters.q);
  const status = clean(filters.status);
  const source = clean(filters.source);
  const tag = clean(filters.tag);
  const list = clean(filters.list);
  const ownerId = clean(filters.ownerId);
  const segmentId = clean(filters.segmentId);
  const pipelineId = clean(filters.pipelineId);
  const stage = clean(filters.stage);

  const pipelineFilter: Prisma.PipelineEntryWhereInput = {
    ...(pipelineId ? { pipelineId } : {}),
    ...(stage && isPipelineStage(stage) ? { stage } : {}),
  };
  const hasPipelineFilter = Boolean(pipelineFilter.pipelineId || pipelineFilter.stage);

  return {
    userId,
    ...(status && isContactStatus(status) ? { status } : {}),
    ...(source ? { source } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(list ? { list } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(segmentId ? { segments: { some: { segmentId } } } : {}),
    ...(hasPipelineFilter ? { pipelineEntries: { some: pipelineFilter } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/**
 * An assigned owner must be the tenant itself or a member of that workspace.
 * Never accept a stranger's users.id (that would look like cross-tenant
 * ownership even though the contact row stays scoped).
 */
export async function assertAssignableOwner(
  tenantId: string,
  ownerId: string | null | undefined,
): Promise<void> {
  if (ownerId == null || ownerId === "") return;
  if (ownerId === tenantId) return;
  const member = await prisma.teamMember.findFirst({
    where: { workspaceId: tenantId, userId: ownerId },
    select: { id: true },
  });
  if (!member) throw new OpError("Invalid owner", 400);
}

/** Distinct org values for the CRM filter bar, scoped to this tenant. */
export async function leadFilterOptions(userId: string) {
  const [sources, lists, owners, tagRows, segments] = await Promise.all([
    prisma.contact.groupBy({
      by: ["source"],
      where: { userId, source: { not: null } },
      orderBy: { source: "asc" },
    }),
    prisma.contact.groupBy({
      by: ["list"],
      where: { userId, list: { not: null } },
      orderBy: { list: "asc" },
    }),
    prisma.contact.groupBy({
      by: ["ownerId"],
      where: { userId, ownerId: { not: null } },
      orderBy: { ownerId: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId, tags: { isEmpty: false } },
      select: { tags: true },
      take: 500,
    }),
    prisma.segment.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  const tags = Array.from(new Set(tagRows.flatMap((row) => row.tags))).sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    sources: sources.map((r) => r.source).filter((s): s is string => Boolean(s)),
    lists: lists.map((r) => r.list).filter((s): s is string => Boolean(s)),
    ownerIds: owners.map((r) => r.ownerId).filter((s): s is string => Boolean(s)),
    tags,
    segments,
    statuses: [...CONTACT_STATUSES],
    stages: [...PIPELINE_STAGES],
  };
}
