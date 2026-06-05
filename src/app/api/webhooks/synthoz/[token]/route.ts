import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRecords, extract, isObj } from "@/lib/synthoz-extract";

// POST /api/webhooks/synthoz/[token] — inbound receiver for Synthoz's async
// "outgoing webhook" results. The token (in the URL the user pastes into
// Synthoz) identifies the owning user. Public route (matched by /api/webhooks).
// Always answers 200 so Synthoz doesn't retry; ingestion is best-effort.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const raw = await req.text();
  // Log the raw delivery so we can learn Synthoz's exact payload shape.
  console.log(`[synthoz-webhook] token=${token.slice(0, 6)}… body=${raw.slice(0, 800)}`);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }

  const user = await prisma.user.findUnique({ where: { webhookToken: token } });
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unknown token" }, { status: 200 });
  }

  // Synthoz failure envelope — nothing to ingest.
  if (isObj(payload) && (payload as { state?: unknown }).state === false) {
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  const records = normalizeRecords(payload);
  let ingested = 0;

  for (const rec of records) {
    const x = extract(rec);
    try {
      if (x.email || (x.name && !x.domain)) {
        // Person → contact (dedupe by email).
        if (x.email) {
          const dupe = await prisma.contact.findFirst({
            where: { userId: user.id, email: x.email },
            select: { id: true },
          });
          if (dupe) continue;
        }
        await prisma.contact.create({
          data: {
            userId: user.id,
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
        // Company → entity (dedupe by domain).
        if (x.domain) {
          const dupe = await prisma.entity.findFirst({
            where: { userId: user.id, domain: x.domain },
            select: { id: true },
          });
          if (dupe) continue;
        }
        await prisma.entity.create({
          data: {
            userId: user.id,
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

  console.log(`[synthoz-webhook] token=${token.slice(0, 6)}… ingested=${ingested}/${records.length}`);
  return NextResponse.json({ ok: true, ingested });
}
