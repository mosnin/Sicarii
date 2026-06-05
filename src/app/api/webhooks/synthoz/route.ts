import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRecords, extract, isObj } from "@/lib/synthoz-extract";

// POST /api/webhooks/synthoz — single app-level inbound receiver for Synthoz's
// async "outgoing webhook" results. The admin configures this URL once in their
// Synthoz dashboard (one URL, all products). Public route; acks 200 always so
// Synthoz does not retry.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  console.log(`[synthoz-webhook] body=${raw.slice(0, 800)}`);

  // Optional HMAC / shared-secret check.
  const secret = process.env.SYNTHOZ_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-webhook-secret") ?? req.headers.get("x-synthoz-secret");
    if (sig !== secret) {
      console.warn("[synthoz-webhook] secret mismatch — rejected");
      return NextResponse.json({ ok: false }, { status: 200 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }

  // Synthoz failure envelope — nothing to ingest.
  if (isObj(payload) && (payload as { state?: unknown }).state === false) {
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  // Attribute to the oldest user (the account owner / admin who owns the API key).
  const owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) {
    console.warn("[synthoz-webhook] no users found — skipping");
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  const records = normalizeRecords(payload);
  let ingested = 0;

  for (const rec of records) {
    const x = extract(rec);
    try {
      if (x.email || (x.name && !x.domain)) {
        if (x.email) {
          const dupe = await prisma.contact.findFirst({
            where: { userId: owner.id, email: x.email },
            select: { id: true },
          });
          if (dupe) continue;
        }
        await prisma.contact.create({
          data: {
            userId: owner.id,
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
            where: { userId: owner.id, domain: x.domain },
            select: { id: true },
          });
          if (dupe) continue;
        }
        await prisma.entity.create({
          data: {
            userId: owner.id,
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

  console.log(`[synthoz-webhook] ingested=${ingested}/${records.length} for user=${owner.id}`);
  return NextResponse.json({ ok: true, ingested });
}
