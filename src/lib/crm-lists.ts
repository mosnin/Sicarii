// CRM list / segment filters. One place so the CRM page, the contacts API,
// and smart-list evaluation cannot drift. Membership lists filter through
// ContactSegment; smart lists with rules apply those filters at query time.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/ids";

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

export type ContactStatusName = (typeof CONTACT_STATUSES)[number];

export type ListRules = {
  status?: string;
  industry?: string;
  tag?: string;
  q?: string;
};

export type ContactListFilters = ListRules & {
  listId?: string;
};

export function parseListRules(raw: unknown): ListRules | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rules: ListRules = {};
  if (typeof o.status === "string" && o.status.trim()) rules.status = o.status.trim();
  if (typeof o.industry === "string" && o.industry.trim()) rules.industry = o.industry.trim();
  if (typeof o.tag === "string" && o.tag.trim()) rules.tag = o.tag.trim();
  if (typeof o.q === "string" && o.q.trim()) rules.q = o.q.trim();
  return Object.keys(rules).length ? rules : null;
}

export function contactWhere(
  userId: string,
  filters: ContactListFilters = {},
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { userId };

  if (filters.status && (CONTACT_STATUSES as readonly string[]).includes(filters.status)) {
    where.status = filters.status as ContactStatusName;
  }
  if (filters.tag) {
    where.tags = { has: filters.tag };
  }
  if (filters.industry) {
    where.entity = { industry: { equals: filters.industry, mode: "insensitive" } };
  }
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { company: { contains: filters.q, mode: "insensitive" } },
      { title: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (isUuid(filters.listId)) {
    where.segments = { some: { segmentId: filters.listId } };
  }
  return where;
}

export async function listIndustries(userId: string): Promise<string[]> {
  const rows = await prisma.entity.findMany({
    where: { userId, industry: { not: null } },
    select: { industry: true },
    distinct: ["industry"],
    take: 200,
    orderBy: { industry: "asc" },
  });
  return rows
    .map((r) => r.industry)
    .filter((v): v is string => Boolean(v && v.trim()));
}

export async function listTags(userId: string): Promise<string[]> {
  const rows = await prisma.contact.findMany({
    where: { userId, tags: { isEmpty: false } },
    select: { tags: true },
    take: 2000,
  });
  const set = new Set<string>();
  for (const row of rows) {
    for (const tag of row.tags) {
      if (tag.trim()) set.add(tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
