// The evidence ledger, ops layer. Same userId-first + OpError convention as
// src/lib/crm-operations.ts: every caller (REST routes, the MCP server, the
// in-app agent) goes through here, and every query is tenant-scoped.
//
// What this file decides is the ROUTING of an observation, which is the point
// of the whole feature:
//
//   primary source AND band VERIFIED -> write the value onto the real record,
//     log the fact as APPLIED, and mirror it into FieldProvenance so the
//     existing "via explorium, 3d ago" chips keep working unchanged.
//   any other non-null band -> PROPOSED. The record is NOT touched. A human
//     settles it from the suggestions queue.
//   band null -> nothing is stored. There was no observation worth keeping.
//
// PROPOSED is not a failure state. Under the old flat-confidence model an
// ambiguous finding had nowhere to live, so it was thrown away; the honest
// answer to "probably her, not certainly" is to show a person and ask, which
// is exactly what AGENTS.md means by preferring nothing over a wrong value.
//
// Apply and dismiss are deliberately NOT reachable by an agent (see
// src/lib/mcp/facts-tools.ts). They are called only from human-session-gated
// REST routes, so an agent cannot promote its own suggestion.

import { prisma } from "@/lib/prisma";
import { Prisma, type FactRecordType, type FactStatus } from "@prisma/client";
import { OpError } from "@/lib/op-error";
import { clampListLimit } from "@/lib/crm-operations";
import { recordProvenance } from "@/lib/provenance";
import {
  scoreEvidence,
  rationaleFor,
  isEvidenceKind,
  EVIDENCE_KINDS,
  type EvidenceEntry,
  type EvidenceKind,
} from "@/lib/evidence";

/** Statuses a fact can be superseded out of: the live ones. */
const LIVE_STATUSES: FactStatus[] = ["APPLIED", "PROPOSED"];

/**
 * Fields a fact may target, per record type. This is an allowlist, not a
 * convenience: `field` arrives from an agent and is used to build the column
 * patch on apply, so anything outside this set must never reach Prisma.
 * Relations, status, tags and ownership columns are excluded on purpose, a
 * fact is about an observed attribute, not about pipeline state.
 */
const CONTACT_FIELDS = new Set([
  "name",
  "email",
  "phone",
  "company",
  "title",
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "twitter",
  "location",
]);

const ENTITY_FIELDS = new Set([
  "name",
  "domain",
  "website",
  "phone",
  "industry",
  "location",
  "description",
  "size",
]);

const MAX_VALUE_CHARS = 2000;
const MAX_DETAIL_CHARS = 500;
const MAX_EVIDENCE_ENTRIES = 20;

export interface RecordFactInput {
  recordType: FactRecordType;
  recordId: string;
  field: string;
  value: string;
  /** What was observed. The caller never supplies a score or a band. */
  evidence: EvidenceEntry[];
  /** How it was found, e.g. "linkedin-lookup", "bouncer", "companies-house". */
  method: string;
  sourceUrl?: string | null;
  observedAt?: Date;
}

export interface RecordFactResult {
  stored: boolean;
  factId: string | null;
  score: number;
  band: string | null;
  status: FactStatus | null;
  /** True when the value was written onto the contact/entity row. */
  applied: boolean;
  rationale: string;
  /** Present when nothing was stored, so the agent learns what was missing. */
  reason?: string;
}

/* ------------------------------ Validation ----------------------------- */

function allowedFields(recordType: FactRecordType): Set<string> {
  return recordType === "CONTACT" ? CONTACT_FIELDS : ENTITY_FIELDS;
}

function normalizeField(recordType: FactRecordType, field: string): string {
  const clean = field.trim();
  if (!allowedFields(recordType).has(clean)) {
    const known = [...allowedFields(recordType)].join(", ");
    throw new OpError(
      `"${field}" is not a fact-recordable field on a ${recordType.toLowerCase()}. Recordable fields: ${known}.`,
      400,
    );
  }
  return clean;
}

function normalizeValue(value: string): string {
  const clean = value?.trim();
  if (!clean) throw new OpError("A fact needs a value", 400);
  if (clean.length > MAX_VALUE_CHARS) {
    throw new OpError(`Value is too long (max ${MAX_VALUE_CHARS} characters)`, 400);
  }
  return clean;
}

/** Reject unknown kinds loudly rather than silently dropping them: an agent
 *  that invented a kind needs to know its observation did not count. */
function normalizeEvidence(entries: EvidenceEntry[]): EvidenceEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new OpError("A fact needs at least one evidence entry", 400);
  }
  if (entries.length > MAX_EVIDENCE_ENTRIES) {
    throw new OpError(`Too many evidence entries (max ${MAX_EVIDENCE_ENTRIES})`, 400);
  }
  return entries.map((entry) => {
    if (!entry || !isEvidenceKind(entry.kind)) {
      const known = Object.keys(EVIDENCE_KINDS).join(", ");
      throw new OpError(
        `"${entry?.kind}" is not an evidence kind. Valid kinds: ${known}.`,
        400,
      );
    }
    const detail = entry.detail?.trim() ?? null;
    return {
      kind: entry.kind as EvidenceKind,
      detail: detail ? detail.slice(0, MAX_DETAIL_CHARS) : null,
      sourceUrl: entry.sourceUrl?.trim() || null,
    };
  });
}

/** Prove the target row belongs to this tenant before anything is written. */
async function assertOwnsRecord(
  userId: string,
  recordType: FactRecordType,
  recordId: string,
): Promise<void> {
  const owner =
    recordType === "CONTACT"
      ? await prisma.contact.findUnique({ where: { id: recordId }, select: { userId: true } })
      : await prisma.entity.findUnique({ where: { id: recordId }, select: { userId: true } });
  if (!owner || owner.userId !== userId) {
    throw new OpError(recordType === "CONTACT" ? "Contact not found" : "Business not found", 404);
  }
}

/**
 * Build the single-column patch for an apply. The computed key is opaque to
 * Prisma's generated input types, so it needs a cast; it is safe because
 * `field` has already been checked against the allowlist above and can only be
 * a real nullable string column on that model.
 */
function fieldPatch(field: string, value: string): Record<string, string> {
  return { [field]: value };
}

async function writeValueToRecord(
  tx: Prisma.TransactionClient,
  userId: string,
  recordType: FactRecordType,
  recordId: string,
  field: string,
  value: string,
): Promise<void> {
  const patch = fieldPatch(field, value);
  if (recordType === "CONTACT") {
    await tx.contact.updateMany({
      where: { id: recordId, userId },
      data: patch as Prisma.ContactUpdateManyMutationInput,
    });
  } else {
    await tx.entity.updateMany({
      where: { id: recordId, userId },
      data: patch as Prisma.EntityUpdateManyMutationInput,
    });
  }
}

/** Mirror an applied fact into the existing per-field provenance row so the
 *  "via <source>, 3d ago" UI keeps working. Best-effort, exactly like every
 *  other provenance write. */
function mirrorProvenance(
  recordType: FactRecordType,
  recordId: string,
  field: string,
  value: string,
  method: string,
  score: number,
): Promise<void> {
  return recordProvenance({
    recordType: recordType === "CONTACT" ? "contact" : "entity",
    recordId,
    field,
    source: method,
    // The ledger's 0-1 score is the honest number now, so it becomes the
    // legacy 0-100 confidence rather than the provider's flat reputation.
    confidence: Math.round(score * 100),
    value,
  });
}

/* ------------------------------- Recording ----------------------------- */

/**
 * Record an observation about a field. The caller reports what it SAW; the
 * ledger decides what that is worth and where it lands.
 *
 * Recording a fact supersedes the previous live fact for the same
 * (recordType, recordId, field), in one transaction, so a field always has at
 * most one APPLIED and one PROPOSED claim standing against it.
 */
export async function recordFact(
  userId: string,
  input: RecordFactInput,
): Promise<RecordFactResult> {
  const recordType = input.recordType;
  const field = normalizeField(recordType, input.field);
  const value = normalizeValue(input.value);
  const evidence = normalizeEvidence(input.evidence);
  const method = input.method?.trim() || "agent";
  const sourceUrl = input.sourceUrl?.trim() || null;
  const observedAt = input.observedAt ?? new Date();

  await assertOwnsRecord(userId, recordType, input.recordId);

  const verdict = scoreEvidence(evidence);

  if (!verdict.band) {
    // Nothing is written, not even a row. An observation this thin is not a
    // suggestion, it is noise, and a queue full of noise stops being read.
    return {
      stored: false,
      factId: null,
      score: verdict.score,
      band: null,
      status: null,
      applied: false,
      rationale: verdict.rationale,
      reason:
        "Not enough evidence to record anything. Report a primary source you actually observed, or leave the field alone.",
    };
  }

  const band = verdict.band;
  const applied = band === "VERIFIED" && verdict.hasPrimary;
  const status: FactStatus = applied ? "APPLIED" : "PROPOSED";
  const now = new Date();

  const fact = await prisma.$transaction(async (tx) => {
    await tx.recordFact.updateMany({
      where: {
        userId,
        recordType,
        recordId: input.recordId,
        field,
        status: { in: LIVE_STATUSES },
      },
      data: { status: "SUPERSEDED", supersededAt: now },
    });

    const created = await tx.recordFact.create({
      data: {
        userId,
        recordType,
        recordId: input.recordId,
        field,
        value,
        score: verdict.score,
        band,
        evidence: verdict.evidence as unknown as Prisma.InputJsonValue,
        method,
        sourceUrl,
        status,
        observedAt,
        ...(applied ? { decidedAt: now } : {}),
      },
    });

    if (applied) {
      await writeValueToRecord(tx, userId, recordType, input.recordId, field, value);
    }

    return created;
  });

  if (applied) {
    await mirrorProvenance(recordType, input.recordId, field, value, method, verdict.score);
  }

  return {
    stored: true,
    factId: fact.id,
    score: verdict.score,
    band,
    status,
    applied,
    rationale: verdict.rationale,
  };
}

/* --------------------------- Human decisions --------------------------- */

async function getOwnedFact(userId: string, id: string) {
  const fact = await prisma.recordFact.findUnique({ where: { id } });
  // Same message for "missing" and "someone else's" - never confirm that
  // another tenant's fact id exists.
  if (!fact || fact.userId !== userId) throw new OpError("Fact not found", 404);
  return fact;
}

/**
 * Promote a proposed fact: write it onto the record and mark it APPLIED.
 * Idempotent (re-applying an already applied fact is a no-op) and scoped, so a
 * user can only ever act on their own tenant's rows.
 */
export async function applyFact(userId: string, factId: string, decidedById: string) {
  const fact = await getOwnedFact(userId, factId);
  if (fact.status === "APPLIED") return fact;
  if (fact.status !== "PROPOSED") {
    throw new OpError("This suggestion has already been settled", 409);
  }
  // The stored field passed the allowlist when it was recorded, but re-check:
  // the allowlist can shrink between the two moments.
  const field = normalizeField(fact.recordType, fact.field);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Any other live claim on this field loses; the human just picked one.
    await tx.recordFact.updateMany({
      where: {
        userId,
        recordType: fact.recordType,
        recordId: fact.recordId,
        field,
        status: { in: LIVE_STATUSES },
        id: { not: fact.id },
      },
      data: { status: "SUPERSEDED", supersededAt: now },
    });

    const row = await tx.recordFact.update({
      where: { id: fact.id },
      data: { status: "APPLIED", decidedById, decidedAt: now },
    });

    await writeValueToRecord(tx, userId, fact.recordType, fact.recordId, field, fact.value);
    return row;
  });

  await mirrorProvenance(
    fact.recordType,
    fact.recordId,
    field,
    fact.value,
    fact.method,
    fact.score,
  );

  return updated;
}

/**
 * Reject a proposed fact. The record is never touched. Idempotent and scoped.
 */
export async function dismissFact(userId: string, factId: string, decidedById: string) {
  const fact = await getOwnedFact(userId, factId);
  if (fact.status === "DISMISSED") return fact;
  if (fact.status !== "PROPOSED") {
    throw new OpError("This suggestion has already been settled", 409);
  }
  return prisma.recordFact.update({
    where: { id: fact.id },
    data: { status: "DISMISSED", decidedById, decidedAt: new Date() },
  });
}

/* -------------------------------- Reads -------------------------------- */

export function parseEvidence(json: Prisma.JsonValue | null | undefined): EvidenceEntry[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    const kind = typeof row.kind === "string" ? row.kind : "";
    if (!isEvidenceKind(kind)) return [];
    return [
      {
        kind,
        detail: typeof row.detail === "string" ? row.detail : null,
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
      },
    ];
  });
}

export interface ProposedFact {
  id: string;
  recordType: FactRecordType;
  recordId: string;
  recordName: string | null;
  field: string;
  value: string;
  currentValue: string | null;
  score: number;
  band: string;
  method: string;
  sourceUrl: string | null;
  observedAt: string;
  evidence: { kind: EvidenceKind; label: string; detail: string | null; sourceUrl: string | null }[];
  rationale: string;
}

function describeEvidence(entries: EvidenceEntry[]) {
  return entries.map((e) => ({
    kind: e.kind,
    label: EVIDENCE_KINDS[e.kind].label,
    detail: e.detail ?? null,
    sourceUrl: e.sourceUrl ?? null,
  }));
}

/**
 * The review queue: proposed facts for this tenant, oldest first (the longest
 * unanswered question is the most overdue). Each row carries the value
 * currently on the record so a human can see what would change.
 */
export async function listProposedFacts(
  userId: string,
  input: { limit?: number; recordType?: FactRecordType; recordId?: string } = {},
): Promise<ProposedFact[]> {
  const facts = await prisma.recordFact.findMany({
    where: {
      userId,
      status: "PROPOSED",
      ...(input.recordType ? { recordType: input.recordType } : {}),
      ...(input.recordId ? { recordId: input.recordId } : {}),
    },
    orderBy: { observedAt: "asc" },
    take: clampListLimit(input.limit),
  });
  if (facts.length === 0) return [];

  // RecordFact points at a contact or entity by id with no relation, so
  // hydrate the two sets in one round trip each rather than N lookups.
  const contactIds = facts.filter((f) => f.recordType === "CONTACT").map((f) => f.recordId);
  const entityIds = facts.filter((f) => f.recordType === "ENTITY").map((f) => f.recordId);

  const [contacts, entities] = await Promise.all([
    contactIds.length
      ? prisma.contact.findMany({ where: { userId, id: { in: contactIds } } })
      : Promise.resolve([]),
    entityIds.length
      ? prisma.entity.findMany({ where: { userId, id: { in: entityIds } } })
      : Promise.resolve([]),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  for (const c of contacts) byId.set(`CONTACT:${c.id}`, c as unknown as Record<string, unknown>);
  for (const e of entities) byId.set(`ENTITY:${e.id}`, e as unknown as Record<string, unknown>);

  return facts.map((fact) => {
    const row = byId.get(`${fact.recordType}:${fact.recordId}`);
    const current = row?.[fact.field];
    const name = row?.name ?? row?.email ?? null;
    const evidence = parseEvidence(fact.evidence);
    return {
      id: fact.id,
      recordType: fact.recordType,
      recordId: fact.recordId,
      recordName: typeof name === "string" ? name : null,
      field: fact.field,
      value: fact.value,
      currentValue: typeof current === "string" ? current : null,
      score: fact.score,
      band: fact.band,
      method: fact.method,
      sourceUrl: fact.sourceUrl,
      observedAt: fact.observedAt.toISOString(),
      evidence: describeEvidence(evidence),
      rationale: rationaleFor(evidence, fact.score, fact.band),
    };
  });
}

/** One fact with its evidence spelled out, for a drill-in or an agent that
 *  wants to know why its own claim landed where it did. */
export async function getFactEvidence(userId: string, factId: string) {
  const fact = await getOwnedFact(userId, factId);
  const evidence = parseEvidence(fact.evidence);
  return {
    id: fact.id,
    recordType: fact.recordType,
    recordId: fact.recordId,
    field: fact.field,
    value: fact.value,
    score: fact.score,
    band: fact.band,
    status: fact.status,
    method: fact.method,
    sourceUrl: fact.sourceUrl,
    observedAt: fact.observedAt.toISOString(),
    decidedAt: fact.decidedAt ? fact.decidedAt.toISOString() : null,
    supersededAt: fact.supersededAt ? fact.supersededAt.toISOString() : null,
    evidence: describeEvidence(evidence),
    rationale: rationaleFor(evidence, fact.score, fact.band),
  };
}
