import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { geocodeCached } from "@/lib/geocode";
import { checkCreationBudget } from "@/lib/creation-guard";

export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const entitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional(),
  website: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  industry: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  size: z.string().trim().max(60).optional(),
  source: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  notes: z.string().trim().max(10000).optional(),
  enrichment: z.record(z.string(), z.unknown()).optional(),
});

const bulkSchema = z.object({
  entities: z.array(entitySchema).min(1).max(100),
});

function normDomain(d?: string): string | undefined {
  return d?.trim().toLowerCase().replace(/^www\./, "") || undefined;
}

// POST /api/entities/bulk - create many entities at once, skipping any that
// already exist in the CRM (matched by domain) or are duplicated in the batch.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = checkRateLimit(`entities:bulk:${user.id}`, 10, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Circuit breaker: a generous ceiling that never blocks normal bulk saves
    // but stops a runaway from accruing tens of thousands of records.
    const budget = await checkCreationBudget(user.id, { limit: 2000 });
    if (!budget.ok) {
      return NextResponse.json(
        { error: `Import paused: ${budget.recent} records were added in the last ${budget.windowMinutes} minutes. Try again shortly.` },
        { status: 429 },
      );
    }

    const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    // Existing domains in the CRM for this user.
    const domains = parsed.data.entities
      .map((e) => normDomain(e.domain))
      .filter((d): d is string => Boolean(d));
    const existing = domains.length
      ? await prisma.entity.findMany({
          where: { userId: user.id, domain: { in: domains } },
          select: { domain: true },
        })
      : [];
    const existingDomains = new Set(existing.map((e) => normDomain(e.domain ?? undefined)));

    const seenInBatch = new Set<string>();
    const toCreate = parsed.data.entities.filter((e) => {
      const d = normDomain(e.domain);
      if (d) {
        if (existingDomains.has(d) || seenInBatch.has(d)) return false;
        seenInBatch.add(d);
      }
      return true;
    });

    let created = 0;
    const toGeocode: { id: string; location: string }[] = [];
    for (const e of toCreate) {
      const { enrichment, tags, ...rest } = e;
      const entity = await prisma.entity.create({
        data: {
          ...rest,
          domain: normDomain(e.domain),
          tags: tags ?? [],
          ...(enrichment ? { enrichment: enrichment as Prisma.InputJsonValue } : {}),
          userId: user.id,
        },
      });
      created++;
      if (entity.location) toGeocode.push({ id: entity.id, location: entity.location });
    }

    // Geocode the new entities in the background so they're already on the map
    // by the time the user opens it. Cache hits are instant; only real Nominatim
    // calls are throttled. Anything left over is caught by the map's backfill.
    if (toGeocode.length) {
      after(async () => {
        for (const e of toGeocode.slice(0, 40)) {
          try {
            const { result, cached } = await geocodeCached(e.location);
            await prisma.entity.update({
              where: { id: e.id },
              data: result
                ? { lat: result.lat, lng: result.lng, geocodedAt: new Date() }
                : { geocodedAt: new Date() },
            });
            if (!cached) await sleep(1100);
          } catch {
            /* leave it for the map backfill loop */
          }
        }
      });
    }

    return NextResponse.json({
      created,
      skipped: parsed.data.entities.length - created,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/bulk", e);
    return NextResponse.json({ error: "Failed to create entities" }, { status: 500 });
  }
}
