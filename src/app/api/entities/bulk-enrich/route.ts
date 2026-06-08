export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { enrichDomain, isExploriumConfigured } from "@/lib/explorium";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(25) });

// POST /api/entities/bulk-enrich - firmographics-enrich many entities at once.
// Sequential + capped so a serverless invocation stays within budget.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`entities:bulk-enrich:${user.id}`, 5, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (!isExploriumConfigured()) {
      return NextResponse.json({ error: "Explorium is not configured." }, { status: 501 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Provide ids: string[]" }, { status: 400 });

    const entities = await prisma.entity.findMany({
      where: { userId: user.id, id: { in: parsed.data.ids } },
    });

    let enriched = 0;
    let skipped = 0;
    for (const entity of entities) {
      if (!entity.domain) { skipped++; continue; }
      try {
        const result = await enrichDomain(entity.domain);
        if (!result) { skipped++; continue; }
        const existing =
          entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
            ? (entity.enrichment as Record<string, unknown>)
            : {};
        const data: Prisma.EntityUncheckedUpdateInput = {
          status: "ENRICHED",
          enrichment: { ...existing, firmographics: result.raw } as Prisma.InputJsonValue,
        };
        const f = result.fields;
        if (f) {
          if (!entity.industry && f.industry) data.industry = f.industry;
          if (!entity.location && f.address) data.location = f.address;
          if (!entity.phone && f.phone) data.phone = f.phone;
          if (!entity.description && f.description) data.description = f.description;
          if (!entity.website && f.website) data.website = f.website;
        }
        await prisma.entity.update({ where: { id: entity.id }, data });
        enriched++;
      } catch (e) {
        console.error(`[bulk-enrich] entity ${entity.id} failed`, e);
        skipped++;
      }
    }

    return NextResponse.json({ enriched, skipped });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/bulk-enrich", e);
    return NextResponse.json({ error: "Bulk enrichment failed" }, { status: 500 });
  }
}
