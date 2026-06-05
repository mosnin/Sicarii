// Shared CRM operations — the single source of truth for entities, contacts,
// email context, search, and enrichment. Every caller (REST routes, the MCP
// server, the in-app agent) goes through here so behavior and ownership checks
// stay identical everywhere. All functions are scoped to a userId.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichDomain, isExploriumConfigured } from "@/lib/explorium";

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

  const enriched = await enrichDomain(entity.domain);
  if (!enriched) throw new OpError(`No enrichment data found for ${entity.domain}`, 404);

  const { raw, fields } = enriched;
  const existing =
    entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? (entity.enrichment as Record<string, unknown>)
      : {};
  const data: Prisma.EntityUncheckedUpdateInput = {
    status: "ENRICHED",
    enrichment: { ...existing, firmographics: raw } as Prisma.InputJsonValue,
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
