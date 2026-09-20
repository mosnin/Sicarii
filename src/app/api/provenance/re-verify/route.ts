// POST /api/provenance/re-verify
//
// Internal endpoint for the re-verification scheduler. Marks stale rows,
// then for each stale contact field re-runs enrichment (if the field is one
// we can actively re-fetch). Entity fields are marked but not re-fetched
// automatically (entity enrichment is more expensive; surface them for
// manual re-enrich).
//
// Designed to be called by Inngest, a Vercel cron, or manually by staff.
// Authentication: requires a valid Scalar API key (Bearer token in header)
// OR the internal CRON_SECRET env var.
//
// Body (optional):
//   { batchSize?: number }  - how many stale rows to process (default 50)
//
// Response:
//   { marked: number, processed: number, refreshed: number, errors: number }

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  markStaleProvenance,
  getStaleProvenance,
  resolveProvenanceAfterVerify,
  STALE_AFTER_DAYS,
} from "@/lib/provenance";
import { enrichContactField } from "@/lib/contact-enrich";
import type { Field } from "@/lib/contact-enrich";

const ENRICHABLE_CONTACT_FIELDS: Field[] = ["linkedin", "email", "phone"];

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  // Allow only cron/internal callers (no user-facing auth here).
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
  const batchSize = Math.min(Math.max(body.batchSize ?? 50, 1), 200);

  // Step 1: mark all old rows as stale.
  const marked = await markStaleProvenance();

  // Step 2: pull a batch of stale rows to process.
  const staleRows = await getStaleProvenance(batchSize);

  let processed = 0;
  let refreshed = 0;
  let errors = 0;

  for (const row of staleRows) {
    processed++;
    try {
      if (row.recordType === "contact" && (ENRICHABLE_CONTACT_FIELDS as string[]).includes(row.field)) {
        // Look up which user owns this contact so we can call the metered path.
        const contact = await prisma.contact.findUnique({
          where: { id: row.recordId },
          select: { userId: true, email: true, phone: true, linkedin: true },
        });
        if (!contact) {
          // Record is gone - clean up the orphan provenance row.
          await prisma.fieldProvenance.delete({ where: { id: row.id } }).catch(() => {});
          continue;
        }

        // Safe cast: we only process enrichable contact fields (email/phone/linkedin).
        const existingValue = (contact as Record<string, string | null>)[row.field] ?? null;
        // Only re-fetch if the field is actually still null or matches the
        // snapshot (if a human has since manually updated it to a different
        // value, leave it alone).
        const snapshotStillMatches =
          !row.valueSnapshot ||
          !existingValue ||
          existingValue === row.valueSnapshot;

        if (!snapshotStillMatches) {
          // Field was manually updated - just mark verified, don't overwrite.
          await resolveProvenanceAfterVerify(row.id, { overwrite: false });
          continue;
        }

        // Temporarily clear the field so enrichContactField will re-fetch
        // (it no-ops when the field is already set). Only do this when
        // the field exactly matches what we stored - safety guard.
        if (existingValue && snapshotStillMatches) {
          await prisma.contact.update({
            where: { id: row.recordId },
            data: { [row.field]: null },
          });
        }

        try {
          const result = await enrichContactField(contact.userId, row.recordId, row.field as Field);
          if (result.value) {
            refreshed++;
            // resolveProvenanceAfterVerify is already called inside
            // enrichContactField via recordProvenance, so just continue.
          } else {
            // Provider returned nothing - mark verified but keep row.
            await resolveProvenanceAfterVerify(row.id, {
              overwrite: false,
            });
          }
        } catch {
          // Re-enrich failed (out of credits, provider down, etc.) -
          // restore the old value to avoid data loss and mark stale again.
          if (existingValue) {
            await prisma.contact.update({
              where: { id: row.recordId },
              data: { [row.field]: existingValue },
            }).catch(() => {});
          }
          errors++;
        }
      } else {
        // Entity fields or non-enrichable contact fields: just mark verified
        // (the user or agent will manually re-enrich when needed).
        // We do NOT re-run expensive entity enrichment automatically.
        const ageMs = Date.now() - new Date(row.retrievedAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        // If it's been over 2x the stale threshold, bump confidence down a bit
        // to signal degrading trust but don't wipe the data.
        const newConfidence = ageDays > STALE_AFTER_DAYS * 2
          ? Math.max(30, row.confidence - 20)
          : row.confidence;
        await resolveProvenanceAfterVerify(row.id, {
          newConfidence,
          overwrite: newConfidence !== row.confidence,
        });
      }
    } catch (e) {
      console.warn("[re-verify] row failed", row.id, e);
      errors++;
    }
  }

  console.log(`[re-verify] marked=${marked} processed=${processed} refreshed=${refreshed} errors=${errors} staleThreshold=${STALE_AFTER_DAYS}d`);

  return NextResponse.json({
    ok: true,
    marked,
    processed,
    refreshed,
    errors,
    staleThresholdDays: STALE_AFTER_DAYS,
    timestamp: new Date().toISOString(),
  });
}
