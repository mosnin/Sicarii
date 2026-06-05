import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRecords, extract, isObj } from "@/lib/synthoz-extract";
import { resolveSynthozOwner } from "@/lib/synthoz-jobs";

// POST /api/webhooks/synthoz - single app-level inbound receiver for Synthoz's
// async "outgoing webhook" results. The developer configures this ONE URL in
// their Synthoz dashboard (one account, all products). Synthoz carries no user
// identity, so each inbound record is attributed back to the Scalar user who
// triggered it via the SynthozJob correlation table (matched on domain/company).
// Public route (matched by /api/webhooks). Always acks 200 so Synthoz won't retry.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  console.log(`[synthoz-webhook] body=${raw.slice(0, 800)}`);

  // Optional shared-secret gate.
  const secret = process.env.SYNTHOZ_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-webhook-secret") ?? req.headers.get("x-synthoz-secret");
    if (sig !== secret) {
      console.warn("[synthoz-webhook] secret mismatch - rejected");
      return NextResponse.json({ ok: false }, { status: 200 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }

  // Synthoz failure envelope - nothing to ingest.
  if (isObj(payload) && (payload as { state?: unknown }).state === false) {
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  const records = normalizeRecords(payload);
  let ingested = 0;
  let unmatched = 0;

  for (const rec of records) {
    const x = extract(rec);

    // Attribute this record to the user who triggered the search.
    const userId = await resolveSynthozOwner({
      domain: x.domain ?? x.website,
      company: x.company ?? x.name,
    });
    if (!userId) {
      unmatched++;
      continue;
    }

    try {
      if (x.email || (x.name && !x.domain)) {
        if (x.email) {
          const dupe = await prisma.contact.findFirst({
            where: { userId, email: x.email },
            select: { id: true },
          });
          if (dupe) continue;
        }
        await prisma.contact.create({
          data: {
            userId,
            name: x.name ?? null,
            email: x.email ?? null,
            phone: x.phone ?? null,
            company: x.company ?? null,
            title: x.title ?? null,
            website: x.website ?? null,
            linkedin: x.linkedin ?? null,
            location: x.location ?? null,
            source: "synthoz-webhook",
            enrichment: rec as Prisma.InputJsonValue,
          },
        });
        ingested++;
      } else if (x.domain || x.company || x.name) {
        if (x.domain) {
          const dupe = await prisma.entity.findFirst({
            where: { userId, domain: x.domain },
            select: { id: true },
          });
          if (dupe) continue;
        }
        await prisma.entity.create({
          data: {
            userId,
            name: x.company || x.name || x.domain!,
            domain: x.domain ?? null,
            website: x.website ?? null,
            location: x.location ?? null,
            status: "ENRICHED",
            source: "synthoz-webhook",
            enrichment: rec as Prisma.InputJsonValue,
          },
        });
        ingested++;
      }
    } catch (e) {
      console.error("[synthoz-webhook] ingest error", e);
    }
  }

  console.log(
    `[synthoz-webhook] ingested=${ingested}/${records.length} unmatched=${unmatched}`
  );
  return NextResponse.json({ ok: true, ingested, unmatched });
}
