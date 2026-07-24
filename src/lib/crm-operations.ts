// Shared CRM operations - the single source of truth for entities, contacts,
// email context, search, and enrichment. Every caller (REST routes, the MCP
// server, the in-app agent) goes through here so behavior and ownership checks
// stay identical everywhere. All functions are scoped to a userId.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichDomain, isExploriumConfigured } from "@/lib/explorium";
import { exaFindCompanies, isExaConfigured } from "@/lib/exa";
import { googleMapsLeads, scrapeSiteContacts, apifyGoogleSearch, isApifyConfigured } from "@/lib/apify";
import { spendCredits, ensureCredits, ensureCreditsForCount, CREDIT_COSTS } from "@/lib/credits";
import { recordProvenanceBulk, CONFIDENCE, type ProvenanceInput } from "@/lib/provenance";
import { placeCall, getCall } from "@/lib/agentphone";
import { assertVariantOwned, attributeReply } from "@/lib/variant-operations";
import {
  deriveAngles,
  mergeAngleResults,
  clampAngleCount,
  isAngleDerivationConfigured,
  normalizeDomain,
  DEFAULT_ANGLES,
  MAX_ANGLES,
  type AngleResult,
} from "@/lib/swarm";

export { OpError } from "@/lib/op-error";
import { OpError } from "@/lib/op-error";

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

// List sizing. Agents (and the UI) page through lists; an unbounded dump of a
// large CRM blows up payloads and agent context windows. Callers may ask for
// 1..MAX_LIST_LIMIT rows; anything else clamps. The default is deliberately
// smaller than the ceiling: ask for more when you mean it.
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;
export function clampListLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
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

export function listEntities(userId: string, q?: string, limit?: number) {
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
    // Lists are for scanning; the enrichment blob (often KBs per row) belongs
    // to get_entity. Omitting it keeps agent token usage and payloads sane.
    omit: { enrichment: true },
    take: clampListLimit(limit),
  });
}

export async function getEntity(userId: string, id: string) {
  const entity = await prisma.entity.findUnique({
    where: { id },
    include: { contacts: { orderBy: { updatedAt: "desc" }, take: 100 } },
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
  const updated = await prisma.entity.update({ where: { id }, data });

  // Debit only after the enrichment is PERSISTED (a DB failure above must not
  // charge), only on a hit (the not-found path throws first), and never on the
  // idempotent short-circuit when firmographics already exist.
  await spendCredits(userId, "company_aspect", { ref: id });

  // Record provenance for the firmographics blob and any columns filled.
  const provenanceRows: ProvenanceInput[] = [
    { recordType: "entity", recordId: id, field: "firmographics", source: "explorium",
      confidence: CONFIDENCE.explorium },
  ];
  if (fields) {
    const colMap: Record<string, string | null | undefined> = {
      industry: fields.industry,
      location: fields.address,
      phone: fields.phone,
      description: fields.description,
      website: fields.website,
    };
    for (const [col, val] of Object.entries(colMap)) {
      if (val) {
        provenanceRows.push({ recordType: "entity", recordId: id, field: col,
          source: "explorium", confidence: CONFIDENCE.explorium, value: val });
      }
    }
  }
  await recordProvenanceBulk(provenanceRows);

  return updated;
}

// Filter a batch of discovered companies down to the ones that are new, both
// against the CRM (by domain then name) and against each other within the
// batch (a duplicate that shows up twice in one batch is only fresh once).
// Shared by every "discover and add" path - findCompanies, discoverLocalLeads,
// swarmDiscover - so the dedup rule can never drift between them; before this
// each caller reimplemented the same norm()+Set logic separately.
async function dedupeAgainstCrm<T extends { companyName: string; domain?: string | null }>(
  userId: string,
  found: T[],
): Promise<{ fresh: T[]; skipped: number }> {
  const existing = await prisma.entity.findMany({
    where: { userId },
    select: { domain: true, name: true },
  });
  const seenDomains = new Set(
    existing.map((e) => normalizeDomain(e.domain)).filter(Boolean) as string[],
  );
  const seenNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));

  const fresh: T[] = [];
  let skipped = 0;
  for (const c of found) {
    const domain = normalizeDomain(c.domain);
    const nameKey = c.companyName.trim().toLowerCase();
    if ((domain && seenDomains.has(domain)) || seenNames.has(nameKey)) {
      skipped++;
      continue;
    }
    if (domain) seenDomains.add(domain);
    seenNames.add(nameKey);
    fresh.push(c);
  }
  return { fresh, skipped };
}

/** Discover CRM-ready companies from a prompt via Exa deep research, dedupe by
 *  domain (then name) against the CRM and within the batch, and add the new
 *  ones as entities. Accuracy first: unnamed/aggregator results are dropped
 *  upstream, and we never create a duplicate. This is the prospecting entry
 *  point (vs search_web, which only returns raw web results) - and the same
 *  single-angle primitive swarmDiscover fans out N of, in parallel, blind to
 *  each other, when a goal needs more than one slice. */
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

  // Filter first, insert once: a single batched INSERT instead of one round
  // trip per company (the old loop was N sequential inserts).
  const { fresh, skipped } = await dedupeAgainstCrm(userId, found);
  const rows = await prisma.entity.createManyAndReturn({
    data: fresh.map((c) => ({
      userId,
      name: c.companyName,
      domain: c.domain ?? null,
      website: c.website ?? null,
      phone: c.phone ?? null,
      industry: c.industry ?? null,
      location: c.address ?? null,
      description: c.description ?? null,
      source: "agent:exa",
      status: "NEW" as const,
    })),
    select: { id: true, name: true, domain: true },
  });
  return { query: input.query, added: rows.length, skipped, created: rows };
}

// Discover local businesses via Apify's Google Maps Actor and add the new ones
// as entities, deduped by domain then name. Same shape/metering as
// findCompanies; the natural tool for local lead gen (no provider but Apify
// returns local businesses with phone + address).
export async function discoverLocalLeads(
  userId: string,
  input: { query: string; location?: string; count?: number }
) {
  if (!isApifyConfigured())
    throw new OpError("Local lead discovery is not configured (APIFY_TOKEN missing)", 501);
  // Gate before the paid Apify run; debit below only when it returns leads.
  await ensureCredits(userId, "maps_leads");
  const count = Math.min(Math.max(input.count ?? 12, 1), 20);
  const found = await googleMapsLeads(input.query, { location: input.location, limit: count });

  if (found.length > 0) {
    await spendCredits(userId, "maps_leads");
  }

  // Filter first, insert once (same shared dedupe as findCompanies).
  const { fresh, skipped } = await dedupeAgainstCrm(userId, found);
  const rows = await prisma.entity.createManyAndReturn({
    data: fresh.map((c) => ({
      userId,
      name: c.companyName,
      domain: c.domain ?? null,
      website: c.website ?? null,
      phone: c.phone ?? null,
      industry: c.industry ?? null,
      location: c.address ?? null,
      source: "agent:apify-maps",
      status: "NEW" as const,
    })),
    select: { id: true, name: true, domain: true },
  });
  return { query: input.query, location: input.location ?? null, added: rows.length, skipped, created: rows };
}

/* --------------------------- Swarm discovery ------------------------- */
//
// Swarm discovery fans a broad goal out into N distinct search angles (given
// explicitly or auto-derived), runs each angle through the SAME single-angle
// primitive findCompanies uses (exaFindCompanies) IN PARALLEL and blind to
// each other's results, then merges across angles and dedupes against the CRM
// exactly once, with per-company attribution of which angle(s) found it. This
// is strictly more thorough than one findCompanies call: N independent slices
// of the goal instead of one query's blind spots, on the same accuracy rules
// (unnamed/aggregator results are dropped upstream by exaFindCompanies).
//
// CREDIT MODEL (see docs/decisions/0011-swarm-discovery.md): gated up front
// for the worst case - every angle hits, billed at the find_companies rate
// each (ensureCreditsForCount) - so a caller always knows the ceiling before
// any paid work starts. The real debit is still per angle, only on a hit
// (spendCredits inside the loop below): an angle that comes back empty costs
// nothing, so a swarm never silently costs more than it gated for, and a
// caller who only needed 2 of 6 angles to hit is only ever billed for those 2.

export interface SwarmDiscoverInput {
  goal: string;
  angles?: string[];
  anglesN?: number;
  count?: number; // per-angle result count, same bounds as findCompanies
}

export interface SwarmAngleBreakdown {
  angle: string;
  found: number;
  credited: boolean;
}

export interface SwarmCompanyAttribution {
  companyName: string;
  domain: string | null;
  angles: string[];
  status: "added" | "duplicate";
  entityId: string | null;
}

export async function swarmDiscover(userId: string, input: SwarmDiscoverInput) {
  if (!isExaConfigured())
    throw new OpError("Discovery is not configured (EXA_API_KEY missing)", 501);

  // Resolve angles first (validation only - no paid work yet) so we know N
  // before gating credits.
  let angles: string[];
  let angleSource: "explicit" | "derived";
  if (input.angles && input.angles.length > 0) {
    const cleaned = [...new Set(input.angles.map((a) => a.trim()).filter(Boolean))];
    if (cleaned.length === 0) throw new OpError("Provide at least one non-empty angle.", 400);
    angles = cleaned.slice(0, MAX_ANGLES);
    angleSource = "explicit";
  } else {
    if (!isAngleDerivationConfigured())
      throw new OpError(
        "Auto-deriving angles needs OPENAI_API_KEY configured. Pass angles explicitly instead.",
        501,
      );
    const n = clampAngleCount(input.anglesN ?? DEFAULT_ANGLES);
    try {
      angles = await deriveAngles(input.goal, n);
    } catch (e) {
      throw new OpError(
        `Could not derive search angles: ${e instanceof Error ? e.message : "unknown error"}`,
        502,
      );
    }
    if (angles.length === 0) throw new OpError("Could not derive any search angles from that goal.", 502);
    angleSource = "derived";
  }

  // Gate up front for the worst case (see credit-model note above). Nothing
  // paid has happened yet - this only bounds the ceiling.
  await ensureCreditsForCount(userId, "find_companies", angles.length);

  const count = Math.min(Math.max(input.count ?? 10, 1), 25);

  // Fan out: each angle runs its OWN Exa search, blind to what the others
  // find. One angle's provider error is logged and treated as an empty
  // result (never charged) rather than sinking the whole swarm.
  const results = await Promise.all(
    angles.map(async (angle): Promise<AngleResult> => {
      try {
        const companies = await exaFindCompanies(angle, count);
        return { angle, companies };
      } catch (e) {
        console.error(`[swarm] angle failed: "${angle}"`, e);
        return { angle, companies: [] };
      }
    }),
  );

  // Debit ONLY the angles that actually returned companies.
  let creditsSpent = 0;
  const perAngle: SwarmAngleBreakdown[] = [];
  for (const r of results) {
    const credited = r.companies.length > 0;
    if (credited) {
      await spendCredits(userId, "find_companies");
      creditsSpent += CREDIT_COSTS.find_companies;
    }
    perAngle.push({ angle: r.angle, found: r.companies.length, credited });
  }

  // Merge across angles (cross-angle dedup + attribution), THEN dedupe the
  // merged set against the CRM (the same rule findCompanies uses).
  const { merged, totalFound } = mergeAngleResults(results);
  const { fresh, skipped } = await dedupeAgainstCrm(
    userId,
    merged.map((m) => m.company),
  );

  const keyOf = (c: { companyName: string; domain?: string | null }) => {
    const d = normalizeDomain(c.domain);
    return d ? `d:${d}` : `n:${c.companyName.trim().toLowerCase()}`;
  };

  const rows = fresh.length
    ? await prisma.entity.createManyAndReturn({
        data: fresh.map((c) => ({
          userId,
          name: c.companyName,
          domain: c.domain ?? null,
          website: c.website ?? null,
          phone: c.phone ?? null,
          industry: c.industry ?? null,
          location: c.address ?? null,
          description: c.description ?? null,
          source: "agent:swarm",
          status: "NEW" as const,
        })),
        select: { id: true, name: true, domain: true },
      })
    : [];
  const rowByKey = new Map(rows.map((r) => [keyOf({ companyName: r.name, domain: r.domain }), r]));

  const companies: SwarmCompanyAttribution[] = merged.map((m) => {
    const row = rowByKey.get(keyOf(m.company));
    return {
      companyName: m.company.companyName,
      domain: m.company.domain ?? null,
      angles: m.angles,
      status: row ? "added" : "duplicate",
      entityId: row?.id ?? null,
    };
  });

  const run = await prisma.swarmRun.create({
    data: {
      userId,
      goal: input.goal,
      angles,
      angleSource,
      found: totalFound,
      merged: merged.length,
      added: rows.length,
      skipped,
      creditsSpent,
      items: { perAngle, companies } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    runId: run.id,
    goal: input.goal,
    angles,
    angleSource,
    found: totalFound,
    merged: merged.length,
    added: rows.length,
    skipped,
    creditsSpent,
    perAngle,
    companies,
  };
}

/** Recent swarm runs (newest first) - the audit trail for what was searched
 *  and what each run found/added, for the results surface. */
export function listSwarmRuns(userId: string, limit?: number) {
  return prisma.swarmRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: clampListLimit(limit),
  });
}

/** One swarm run's full breakdown (per-angle counts + per-company attribution). */
export async function getSwarmRun(userId: string, id: string) {
  const run = await prisma.swarmRun.findUnique({ where: { id } });
  if (!run || run.userId !== userId) throw new OpError("Swarm run not found", 404);
  return run;
}

// Pull a site's public contact details (emails/phones/socials) via Apify. Does
// NOT auto-create contacts - returns the data so the caller saves selectively
// (never makes junk records from unnamed emails). Self-metering: 8 credits when
// details are found, nothing on a miss.
export async function extractSiteContacts(userId: string, url: string) {
  if (!isApifyConfigured())
    throw new OpError("Contact extraction is not configured (APIFY_TOKEN missing)", 501);
  await ensureCredits(userId, "contact_extract");
  const contacts = await scrapeSiteContacts(url);
  if (contacts.length > 0) await spendCredits(userId, "contact_extract");
  return { url, found: contacts.length, contacts };
}

// Organic Google results for a query via Apify. Self-metering: 4 credits per
// search that returns results, nothing on a miss.
export async function searchGoogle(
  userId: string,
  input: { query: string; limit?: number }
) {
  if (!isApifyConfigured())
    throw new OpError("Web search via Apify is not configured (APIFY_TOKEN missing)", 501);
  await ensureCredits(userId, "serp_search");
  const results = await apifyGoogleSearch(input.query, input.limit ?? 15);
  if (results.length > 0) await spendCredits(userId, "serp_search");
  return { query: input.query, count: results.length, results };
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
  facebook?: string | null;
  instagram?: string | null;
  twitter?: string | null;
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
  opts: { q?: string; status?: string; limit?: number } = {}
) {
  const { q, status, limit } = opts;
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
    // Same as listEntities: the enrichment blob belongs to get_contact.
    omit: { enrichment: true },
    take: clampListLimit(limit),
  });
}

export async function getContact(userId: string, id: string) {
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      entity: { select: { id: true, name: true } },
      // Capped: a long relationship otherwise blows up the payload (and an
      // agent's context) with every message ever saved.
      emails: { orderBy: { sentAt: "desc" }, take: 50 },
      socialMessages: { orderBy: { createdAt: "desc" }, take: 50 },
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

/* -------------------------- Social messages ------------------------- */

export type SocialChannelName = "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK" | "OTHER";

export interface SocialMessageInput {
  contactId: string;
  channel: SocialChannelName;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  threadRef?: string | null;
  savedAsContext?: boolean;
  sentAt?: Date | null;
  // Self-optimizing outreach: the OutreachVariant (subject/opener) used for
  // this OUTBOUND message, from select_variant. Recorded as a VariantSend so
  // a later inbound reply on this contact can be attributed back to it.
  // Ignored on INBOUND (a reply doesn't "use" a variant, it resolves one).
  variantId?: string | null;
}

/** Save a social media message (DM, comment, connection note) onto a contact
 *  and keep the pipeline state honest: an OUTBOUND message stamps
 *  lastContactedAt and advances NEW/ENRICHED to CONTACTED; an INBOUND message
 *  advances CONTACTED to REPLIED. Never downgrades a status.
 *
 *  Self-optimizing outreach hook: an OUTBOUND message carrying variantId
 *  records a VariantSend (and bumps that variant's sends counter) so the
 *  bandit has data to learn from. An INBOUND message that flips the contact
 *  to REPLIED attributes the reply to that contact's most-recent unreplied
 *  variant send, if any - this is the one place a reply is detected, so it
 *  is the one place attribution can happen honestly. */
export async function saveSocialMessage(userId: string, input: SocialMessageInput) {
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);

  const recordsSend = input.direction === "OUTBOUND" && Boolean(input.variantId);
  if (recordsSend) await assertVariantOwned(userId, input.variantId!);

  const { contactId, variantId, ...rest } = input;
  const becomesReplied = input.direction === "INBOUND" && contact.status === "CONTACTED";
  const touch: Prisma.ContactUncheckedUpdateInput =
    input.direction === "OUTBOUND"
      ? {
          lastContactedAt: new Date(),
          ...(ADVANCE_FROM_OUTREACH.has(contact.status) ? { status: "CONTACTED" as const } : {}),
        }
      : becomesReplied
        ? { status: "REPLIED" as const }
        : {};

  const [message] = await prisma.$transaction([
    prisma.contactSocialMessage.create({ data: { contactId, ...rest } }),
    prisma.contact.update({ where: { id: contactId }, data: touch }),
    ...(recordsSend
      ? [
          prisma.variantSend.create({
            data: { variantId: variantId!, contactId, sentAt: input.sentAt ?? new Date() },
          }),
          prisma.outreachVariant.update({ where: { id: variantId! }, data: { sends: { increment: 1 } } }),
        ]
      : []),
  ]);

  // Attribution reads/writes its own row atomically (see attributeReply) and
  // runs after the message is durably saved; it must never block or fail the
  // reply itself just because there's nothing to attribute.
  if (becomesReplied) await attributeReply(contactId);

  return message;
}

/** The social message history with a contact (newest first), optionally
 *  filtered to one channel. */
export async function listSocialMessages(
  userId: string,
  contactId: string,
  channel?: SocialChannelName,
) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true },
  });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  return prisma.contactSocialMessage.findMany({
    where: { contactId, ...(channel ? { channel } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** The email history with a contact (newest first). Mirrors listSocialMessages
 *  so agents can page through either channel the same way. */
export async function listContactEmails(userId: string, contactId: string, limit?: number) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true },
  });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  return prisma.contactEmail.findMany({
    where: { contactId },
    orderBy: { sentAt: "desc" },
    take: clampListLimit(limit),
  });
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

// ─── Outreach & activity tracking ────────────────────────────────────────────

const ADVANCE_FROM_OUTREACH = new Set(["NEW", "ENRICHED"]);

/** Record an outbound touch on a contact: stamp lastContactedAt, advance status
 *  (explicit override wins; otherwise bump NEW/ENRICHED -> CONTACTED and never
 *  downgrade a contact already further along), and log an Activity, atomically.
 *  This is the memory that lets an agent follow up reliably. */
export interface ActivityActor {
  id: string; // ApiKey.id (agent) or users.id (human member)
  label: string; // display snapshot: key name or member name
}

export async function logOutreach(
  userId: string,
  input: {
    contactId: string;
    summary: string;
    channel?: "email" | "linkedin" | "phone" | "x" | "instagram" | "facebook" | "other";
    status?: ContactStatus;
    actor?: ActivityActor | null;
    // Self-optimizing outreach: the OutreachVariant (subject/opener) used for
    // this touch, from select_variant. Optional and backward-compatible -
    // omitting it behaves exactly as before. When set, records a VariantSend
    // and bumps that variant's sends counter so the bandit has data to learn
    // from; a later reply on this contact (detected in saveSocialMessage, the
    // only place INBOUND advances a contact to REPLIED today) attributes back
    // to it.
    variantId?: string | null;
  }
) {
  const existing = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!existing || existing.userId !== userId) throw new OpError("Contact not found", 404);

  if (input.variantId) await assertVariantOwned(userId, input.variantId);

  const nextStatus =
    input.status ?? (ADVANCE_FROM_OUTREACH.has(existing.status) ? "CONTACTED" : existing.status);

  const [contact] = await prisma.$transaction([
    prisma.contact.update({
      where: { id: input.contactId },
      data: { status: nextStatus as ContactStatus, lastContactedAt: new Date() },
    }),
    prisma.activity.create({
      data: {
        userId,
        contactId: input.contactId,
        kind: "outreach",
        body: input.summary,
        channel: input.channel ?? null,
        actorId: input.actor?.id ?? null,
        actorLabel: input.actor?.label ?? null,
      },
    }),
    ...(input.variantId
      ? [
          prisma.variantSend.create({
            data: { variantId: input.variantId, contactId: input.contactId, sentAt: new Date() },
          }),
          prisma.outreachVariant.update({
            where: { id: input.variantId },
            data: { sends: { increment: 1 } },
          }),
        ]
      : []),
  ]);
  return { id: contact.id, status: contact.status, lastContactedAt: contact.lastContactedAt };
}

/** Log a timestamped note/call/reply on a contact or company without
 *  overwriting its notes field. */
export async function addActivity(
  userId: string,
  input: {
    contactId?: string;
    entityId?: string;
    kind: "note" | "call" | "outreach" | "reply" | "status_change";
    body: string;
    channel?: string | null;
    actor?: ActivityActor | null;
  }
) {
  if (!input.contactId && !input.entityId)
    throw new OpError("Provide a contactId or entityId", 400);
  if (input.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!c || c.userId !== userId) throw new OpError("Contact not found", 404);
  }
  if (input.entityId) {
    const e = await prisma.entity.findUnique({ where: { id: input.entityId } });
    if (!e || e.userId !== userId) throw new OpError("Entity not found", 404);
  }
  return prisma.activity.create({
    data: {
      userId,
      contactId: input.contactId ?? null,
      entityId: input.entityId ?? null,
      kind: input.kind,
      body: input.body,
      channel: input.channel ?? null,
      actorId: input.actor?.id ?? null,
      actorLabel: input.actor?.label ?? null,
    },
  });
}

/** The activity trail (newest first) for a contact or company. */
export async function listActivities(
  userId: string,
  input: { contactId?: string; entityId?: string; limit?: number }
) {
  if (!input.contactId && !input.entityId)
    throw new OpError("Provide a contactId or entityId", 400);
  return prisma.activity.findMany({
    where: {
      userId,
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
}

/** Who needs a follow-up: contacts in a status (default CONTACTED) not touched
 *  in the last N days (default 7), oldest first. A null lastContactedAt counts
 *  as due. This is how an autonomous agent finds who to chase next. */
export async function listDueFollowups(
  userId: string,
  input: { status?: ContactStatus; staleDays?: number; limit?: number }
) {
  const status = (input.status ?? "CONTACTED") as ContactStatus;
  const staleDays = input.staleDays ?? 7;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  return prisma.contact.findMany({
    where: {
      userId,
      status,
      OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: cutoff } }],
    },
    orderBy: { lastContactedAt: { sort: "asc", nulls: "first" } },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      status: true,
      lastContactedAt: true,
    },
  });
}

// ─── Phone calls (AgentPhone) ────────────────────────────────────────────────

export interface CallInput {
  contactId: string;
  direction: "INBOUND" | "OUTBOUND";
  toNumber?: string | null;
  fromNumber?: string | null;
  status?: string | null;
  durationSec?: number | null;
  summary?: string | null;
  transcript?: string | null;
  recordingUrl?: string | null;
  agentPhoneCallId?: string | null;
  savedAsContext?: boolean;
  startedAt?: Date | null;
}

/** Log a phone call onto a contact (e.g. a call made outside Scalar, for context). */
export async function saveCall(userId: string, input: CallInput) {
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  const { contactId, ...rest } = input;
  return prisma.contactCall.create({ data: { contactId, ...rest } });
}

/** Place an outbound call to a contact via the user's connected AgentPhone
 *  account, log it as a ContactCall, and mark the contact CONTACTED. */
export async function placeContactCall(
  userId: string,
  input: {
    contactId: string;
    systemPrompt: string;
    toNumber?: string;
    agentId?: string;
    fromNumberId?: string;
    initialGreeting?: string;
  },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { agentPhoneApiKey: true },
  });
  if (!user?.agentPhoneApiKey)
    throw new OpError("Connect your AgentPhone account in Settings first (no AgentPhone key).", 501);

  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);

  const toNumber = (input.toNumber || contact.phone || "").trim();
  if (!toNumber)
    throw new OpError("No phone number for this contact - add one or pass toNumber in E.164 form.", 400);

  const placed = await placeCall(user.agentPhoneApiKey, {
    toNumber,
    systemPrompt: input.systemPrompt,
    agentId: input.agentId,
    fromNumberId: input.fromNumberId,
    initialGreeting: input.initialGreeting,
  });

  const call = await prisma.contactCall.create({
    data: {
      contactId: contact.id,
      direction: "OUTBOUND",
      toNumber,
      agentPhoneCallId: placed.callId || null,
      status: placed.status ?? "in-progress",
      startedAt: placed.startedAt ? new Date(placed.startedAt) : new Date(),
    },
  });

  // Advance status (never downgrade) and stamp the outreach timestamp.
  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      lastContactedAt: new Date(),
      ...(contact.status === "NEW" || contact.status === "ENRICHED"
        ? { status: "CONTACTED" as const }
        : {}),
    },
  });

  return {
    callId: placed.callId,
    status: placed.status ?? "in-progress",
    contactId: contact.id,
    logId: call.id,
    toNumber,
  };
}

/** The call history with a contact (newest first). */
export async function listContactCalls(userId: string, contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true },
  });
  if (!contact || contact.userId !== userId) throw new OpError("Contact not found", 404);
  return prisma.contactCall.findMany({
    where: { contactId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
}

/** Refresh a logged call's status/transcript/recording from AgentPhone. */
export async function syncContactCall(userId: string, callLogId: string) {
  const call = await prisma.contactCall.findUnique({
    where: { id: callLogId },
    include: { contact: { select: { userId: true } } },
  });
  if (!call || call.contact.userId !== userId) throw new OpError("Call not found", 404);
  if (!call.agentPhoneCallId) throw new OpError("This call has no AgentPhone id to sync.", 400);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { agentPhoneApiKey: true },
  });
  if (!user?.agentPhoneApiKey)
    throw new OpError("Connect your AgentPhone account in Settings first.", 501);

  const detail = await getCall(user.agentPhoneApiKey, call.agentPhoneCallId);
  return prisma.contactCall.update({
    where: { id: callLogId },
    data: {
      status: detail.status ?? call.status,
      durationSec: detail.durationSec ?? call.durationSec,
      transcript: detail.transcript ?? call.transcript,
      recordingUrl: detail.recordingUrl ?? call.recordingUrl,
    },
  });
}
