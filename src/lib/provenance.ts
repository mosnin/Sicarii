// Provenance write helpers - Moment 3: Visible Trust.
//
// Every enriched field on a record carries a FieldProvenance row that records
// which provider supplied it, how confident the match was, what value was
// stored, and when. The UI reads these rows to render "via explorium, 3 days
// ago" on each field. The re-verify path marks rows stale and re-runs
// enrichment to keep values fresh.
//
// Design constraints:
//   - All writes are best-effort (never fail the enrichment call itself).
//   - Upsert on (recordType, recordId, field) so a re-enrich updates in place.
//   - Higher-confidence values never overwrite lower-confidence ones implicitly;
//     callers decide by passing the relevant confidence.
//   - valueSnapshot is capped at 500 chars to keep rows lean.

import { prisma } from "@/lib/prisma";

export type ProvenanceRecordType = "contact" | "entity";

export interface ProvenanceInput {
  recordType: ProvenanceRecordType;
  recordId: string;
  field: string;
  source: string; // provider slug, e.g. "explorium", "pipe0", "exa", "manual"
  confidence?: number; // 0-100, default 80
  value?: string | null; // the value that was stored
}

// Confidence presets by provider/context. Call sites can override.
export const CONFIDENCE = {
  exa: 75, // neural search, high hit rate but less exact matching
  pipe0: 85, // commercial data, strong domain match
  explorium: 90, // commercial data, name + domain verified
  manual: 100, // user-entered, always trusted
  inferred: 40, // derived/guessed, not directly verified
  // Authoritative public registries (verified-entity enrichment).
  companies_house: 99, // UK statutory registry
  gleif: 97, // global LEI registry (CC0)
  sec_edgar: 96, // US SEC filings (public domain)
  // Email finding + verification waterfall (resale-safe providers).
  anymailfinder: 80,
  findymail: 80,
  bouncer: 92, // verified deliverable
  // Self-derived from already-crawled HTML (no third-party data).
  derived: 55,
} as const;

// Snapshot value: truncate large blobs; null for empty/undefined.
function snapshot(value?: string | null): string | undefined {
  if (!value || !value.trim()) return undefined;
  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}

/**
 * Record (upsert) provenance for a single field after a successful enrichment
 * write. Always best-effort: a DB error here never fails the enrichment itself.
 *
 * Call this AFTER the contact/entity row has been updated (so the snapshot
 * matches what is actually in the DB).
 */
export async function recordProvenance(input: ProvenanceInput): Promise<void> {
  try {
    const confidence = input.confidence ?? CONFIDENCE[input.source as keyof typeof CONFIDENCE] ?? 80;
    await prisma.fieldProvenance.upsert({
      where: {
        recordType_recordId_field: {
          recordType: input.recordType,
          recordId: input.recordId,
          field: input.field,
        },
      },
      update: {
        source: input.source,
        confidence,
        valueSnapshot: snapshot(input.value),
        retrievedAt: new Date(),
        verifiedAt: new Date(),
        stale: false,
      },
      create: {
        recordType: input.recordType,
        recordId: input.recordId,
        field: input.field,
        source: input.source,
        confidence,
        valueSnapshot: snapshot(input.value),
        retrievedAt: new Date(),
        verifiedAt: new Date(),
        stale: false,
      },
    });
  } catch (e) {
    // Best-effort: provenance is never worth crashing enrichment over.
    console.warn("[provenance] write failed", e);
  }
}

/**
 * Record provenance for multiple fields at once (convenience wrapper for
 * bulk enrichment paths like entity firmographics which fill several columns).
 */
export async function recordProvenanceBulk(
  inputs: ProvenanceInput[],
): Promise<void> {
  await Promise.all(inputs.map(recordProvenance));
}

/**
 * Fetch all provenance rows for a record, keyed by field name for O(1) UI
 * lookup. Returns an empty object when no rows exist.
 */
export async function getProvenanceMap(
  recordType: ProvenanceRecordType,
  recordId: string,
): Promise<
  Record<
    string,
    {
      source: string;
      confidence: number;
      retrievedAt: Date;
      verifiedAt: Date | null;
      stale: boolean;
    }
  >
> {
  try {
    const rows = await prisma.fieldProvenance.findMany({
      where: { recordType, recordId },
      select: {
        field: true,
        source: true,
        confidence: true,
        retrievedAt: true,
        verifiedAt: true,
        stale: true,
      },
    });
    return Object.fromEntries(rows.map((r) => [r.field, r]));
  } catch (e) {
    console.warn("[provenance] read failed", e);
    return {};
  }
}

// ── Staleness + re-verify ────────────────────────────────────────────────────

// A field is stale after this many days without a re-verify.
export const STALE_AFTER_DAYS = 30;

/**
 * Mark all provenance rows older than STALE_AFTER_DAYS as stale.
 * Designed to be called by a scheduler (e.g. Inngest or a cron endpoint).
 * Returns the count of rows marked.
 */
export async function markStaleProvenance(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.fieldProvenance.updateMany({
    where: {
      stale: false,
      retrievedAt: { lt: cutoff },
    },
    data: { stale: true },
  });
  return count;
}

/**
 * Fetch stale provenance rows, optionally limited. Used by the re-verify
 * scheduler to pull a batch to process.
 */
export async function getStaleProvenance(limit = 50) {
  return prisma.fieldProvenance.findMany({
    where: { stale: true },
    orderBy: { retrievedAt: "asc" },
    take: limit,
  });
}

/**
 * After a re-verify attempt (whether it found data or not), update the row.
 * If the new value has lower confidence than the existing value, do NOT
 * overwrite - prefer the better value. Pass null for newValue if the
 * provider returned no data (marks verified but keeps existing value).
 */
export async function resolveProvenanceAfterVerify(
  rowId: string,
  opts: {
    newSource?: string;
    newConfidence?: number;
    newValue?: string | null;
    overwrite: boolean; // only overwrite when newConfidence >= existing
  },
): Promise<void> {
  try {
    const existing = await prisma.fieldProvenance.findUnique({ where: { id: rowId } });
    if (!existing) return;

    const incoming = opts.newConfidence ?? 80;
    // Never replace a good value with a worse one.
    const shouldOverwrite = opts.overwrite && incoming >= existing.confidence;

    await prisma.fieldProvenance.update({
      where: { id: rowId },
      data: {
        verifiedAt: new Date(),
        stale: false,
        ...(shouldOverwrite && opts.newSource
          ? {
              source: opts.newSource,
              confidence: incoming,
              valueSnapshot: snapshot(opts.newValue),
              retrievedAt: new Date(),
            }
          : {}),
      },
    });
  } catch (e) {
    console.warn("[provenance] resolve after verify failed", e);
  }
}
