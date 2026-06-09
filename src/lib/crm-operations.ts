// Shared CRM operations - the single source of truth for entities, contacts,
// email context, search, and enrichment. Every caller (REST routes, the MCP
// server, the in-app agent) goes through here so behavior and ownership checks
// stay identical everywhere. All functions are scoped to a userId.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichDomain, isExploriumConfigured } from "@/lib/explorium";
import { exaFindCompanies, isExaConfigured } from "@/lib/exa";
import { spendCredits, ensureCredits } from "@/lib/credits";

export class OpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OpError";
    this.status = status;
  }
}

const CONTACT_STATUSES = [
  "NEW",
  "ENRICHED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
  "ARCHIVED",
] as const;
type ContactStatus = (typeof CONTACT_STATUSES)[number];

type EntityStatus = "NEW" | "ENRICHED" | "ARCHIVED";

function asJson(v: unknown): Prisma.InputJsonValue | undefined {
  return v == null ? undefined : (v as Prisma.InputJsonValue);
}

/* ----------------------------- Entities ----------------------------- */

export interface EntityInput {
  name: string;
  domain?: string | null;
  website?: string | null;
  phone?: string | null;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
  size?: string | null;
  status?: EntityStatus;
  source?: string | null;
  tags?: string[];
  notes?: string | null;
  enrichment?: unknown;
}

export function listEntities(userId: string, q?: string) {
  return prisma.entity.findMany({
    where: {
      userId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { domain: { contains: q, mode: "insensitive" } },
              { industry: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { contacts: true } } },
    take: 200,
  });
}

export async function getEntity(userId: string, id: string) {
  const entity = await prisma.entity.findUnique({
    where: { id },
    include: { contacts: { orderBy: { updatedAt: "desc" } } },
  });
  if (!entity || entity.userId !== userId) throw new OpError("Entity not found", 404);
  return entity;
}

export function createEntity(userId: string, input: EntityInput) {
  const { enrichment, tags, ...rest } = input;
  return prisma.entity.create({
    data: {
      ...rest,
      tags: tags ?? [],
      ...(asJson(enrichment) ? { enrichment: asJson(enrichment) } : {}),
      userId,
    },
  });
}

export async function updateEntity(
  userId: string,
  id: string,
  input: Partial<EntityInput>
) {
  const existing = await prisma.entity.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId)
    throw new OpError("Entity not found", 404);
  const { enrichment, ...rest } = input;
  const data: Prisma.EntityUncheckedUpdateInput = { ...rest };
  if (enrichment !== undefined) {
    data.enrichment =
      enrichment === null ? Prisma.DbNull : (enrichment as Prisma.InputJsonValue);
  }
  return prisma.entity.update({ where: { id }, data });
}

export async function deleteEntity(userId: string, id: string) {
  const existing = await prisma.entity.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId)
    throw new OpError("Entity not found", 404);
  await prisma.entity.delete({ where: { id } });
  return { ok: true };
}

/** Enrich a business via Explorium using its domain; fills empty columns and
 *  stores firmographics under enrichment. Never persists null. */
export async function enrichEntity(userId: string, id: string) {
  const entity = await prisma.entity.findUnique({ where: { id } });
  if (!entity || entity.userId !== userId)
    throw new OpError("Entity not found", 404);
  if (!entity.domain) throw new OpError("Entity has no domain to enrich from", 400);
  if (!isExploriumConfigured())
    throw new OpError("Enrichment is not configured (EXPLORIUM_API_KEY missing)", 501);

  // Idempotency: don't re-charge Explorium if firmographics are already present
  // (an agent re-calling enrich_entity on the same id otherwise pays every time).
  const already =
    entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? (entity.enrichment as Record<string, unknown>)
      : {};
  if (already.firmographics) {
    return entity;
  }

  // Gate before the paid Explorium call; debit only on a hit below.
  await ensureCredits(userId, "company_aspect");

  const enriched = await enrichDomain(entity.domain);
  if (!enriched) throw new OpError(`No enrichment data found for ${entity.domain}`, 404);

  // Debit only on a hit (the not-found path above throws first), and never on
  // the idempotent short-circuit when firmographics already exist.
  await spendCredits(userId, "company_aspect", { ref: id });

  const { raw, fields } = enriched;
  const data: Prisma.EntityUncheckedUpdateInput = {
    status: "ENRICHED",
    enrichment: { ...already, firmographics: raw } as Prisma.InputJsonValue,
  };
  if (fields) {
    if (!entity.industry && fields.industry) data.industry = fields.industry;
    if (!entity.location && fields.address) data.location = fields.address;
    if (!entity.phone && fields.phone) data.phone = fields.phone;
    if (!entity.description && fields.description) data.description = fields.description;
    if (!entity.website && fields.website) data.website = fields.website;
  }
  return prisma.entity.update({ where: { id }, data });
}

/** Discover CRM-ready companies from a prompt via Exa deep research, dedupe by
 *  domain (then name) against the CRM and within the batch, and add the new
 *  ones as entities. Accuracy first: unnamed/aggregator results are dropped
 *  upstream, and we never create a duplicate. This is the prospecting entry
 *  point (vs search_web, which only returns raw web results). */
export async function findCompanies(
  userId: string,
  input: { query: string; count?: number }
) {
  if (!isExaConfigured())
    throw new OpError("Discovery is not configured (EXA_API_KEY missing)", 501);
  // Gate before the paid Exa call; debit below only when it returns companies.
  await ensureCredits(userId, "find_companies");
  const count = Math.min(Math.max(input.count ?? 10, 1), 25);
  const found = await exaFindCompanies(input.query, count);

  // Debit only when the discovery actually returned companies - a dry query
  // costs nothing.
  if (found.length > 0) {
    await spendCredits(userId, "find_companies");
  }

  const existing = await prisma.entity.findMany({
    where: { userId },
    select: { domain: true, name: true },
  });
  const norm = (d?: string | null) => d?.toLowerCase().replace(/^www\./, "").trim() || undefined;
  const seenDomains = new Set(existing.map((e) => norm(e.domain)).filter(Boolean) as string[]);
  const seenNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));

  const created: { id: string; name: string; domain: string | null }[] = [];
  let skipped = 0;
  for (const c of found) {
    const domain = norm(c.domain);
    const nameKey = c.companyName.trim().toLowerCase();
    if ((domain && seenDomains.has(domain)) || seenNames.has(nameKey)) {
      skipped++;
      continue;
    }
    const entity = await createEntity(userId, {
      name: c.companyName,
      domain: c.domain ?? null,
      website: c.website ?? null,
      phone: c.phone ?? null,
      industry: c.industry ?? null,
      location: c.address ?? null,
      description: c.description ?? null,
      source: "agent:exa",
      status: "NEW",
    });
    if (domain) seenDomains.add(domain);
    seenNames.add(nameKey);
    created.push({ id: entity.id, name: entity.name, domain: entity.domain });
  }
  return { query: input.query, added: created.length, skipped, created };
}

/* ----------------------------- Contacts ----------------------------- */

export interface ContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  linkedin?: string | null;
  location?: string | null;
  status?: ContactStatus;
  source?: string | null;
  tags?: string[];
  notes?: string | null;
  enrichment?: unknown;
  entityId?: string | null;
}

export function listContacts(
  userId: string,
  opts: { q?: string; status?: string } = {}
) {
  const { q, status } = opts;
  return prisma.contact.findMany({
    where: {
      userId,
      ...(status && (CONTACT_STATUSES as readonly string[]).includes(status)
        ? { status: status as ContactStatus }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { entity: { select: { id: true, name: true } } },
    take: 200,
  });
}

export async function getContact(userId: string, id: string) {
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      entity: { select: { id: true, name: true } },
      emails: { orderBy: { sentAt: "desc" } },
    },
  });
  if (!contact || contact.userId !== userId)
    throw new OpError("Contact not found", 404);
  return contact;
}

async function assertEntityOwned(userId: string, entityId: string) {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity || entity.userId !== userId) throw new OpError("Invalid entity", 400);
}

export async function createContact(userId: string, input: ContactInput) {
  const { enrichment, tags, entityId, ...rest } = input;
  if (entityId) await assertEntityOwned(userId, entityId);
  return prisma.contact.create({
    data: {
      ...rest,
      tags: tags ?? [],
      ...(asJson(enrichment) ? { enrichment: asJson(enrichment) } : {}),
      entityId: entityId ?? undefined,
      userId,
    },
  });
}

export async function updateContact(
  userId: string,
  id: string,
  input: Partial<ContactInput>
) {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId)
    throw new OpError("Contact not found", 404);
  const { enrichment, entityId, ...rest } = input;
  if (entityId) await assertEntityOwned(userId, entityId);
  const data: Prisma.ContactUncheckedUpdateInput = { ...rest };
  if (entityId !== undefined) data.entityId = entityId;
  if (enrichment !== undefined) {
    data.enrichment =
      enrichment === null ? Prisma.DbNull : (enrichment as Prisma.InputJsonValue);
  }
  return prisma.contact.update({ where: { id }, data });
}

export async function deleteContact(userId: string, id: string) {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId)
    throw new OpError("Contact not found", 404);
  await prisma.contact.delete({ where: { id } });
  return { ok: true };
}

/* --------------------------- Email context -------------------------- */

export interface EmailInput {
  contactId: string;
  direction: "INBOUND" | "OUTBOUND";
  subject?: string | null;
  body?: string | null;
  fromAddr?: string | null;
  toAddr?: string | null;
  agentMailMessageId?: string | null;
  agentMailThreadId?: string | null;
  savedAsContext?: boolean;
  sentAt?: Date | null;
}

/** Save an email exchange onto a contact (e.g. agent-saved context). */
export async function saveEmail(userId: string, input: EmailInput) {
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
  });
  if (!contact || contact.userId !== userId)
    throw new OpError("Contact not found", 404);
  const { contactId, ...rest } = input;
  return prisma.contactEmail.create({ data: { contactId, ...rest } });
}

/* ------------------------------ Search ------------------------------ */

/** Search across entities and contacts. */
export async function searchCrm(userId: string, q: string) {
  const [entities, contacts] = await Promise.all([
    listEntities(userId, q),
    listContacts(userId, { q }),
  ]);
  return { entities, contacts };
}
