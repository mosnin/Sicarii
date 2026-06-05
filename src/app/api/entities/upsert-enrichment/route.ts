import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

const schema = z.object({
  domain: z.string().trim().min(1).max(255),
  key: z.string().trim().min(1).max(80),
  data: z.unknown(),
  name: z.string().trim().max(200).optional(),
});

function norm(d: string) {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

// POST /api/entities/upsert-enrichment
// Match an entity by domain (create it if absent), then merge the provider
// payload under enrichment[key]. This is how enrichment tools (tech stack,
// funding, firmographics, …) attach data to a company instead of creating junk.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const domain = norm(parsed.data.domain);
    const { key, data, name } = parsed.data;

    const existing = await prisma.entity.findFirst({
      where: { userId: user.id, domain },
    });

    const mergedEnrichment = {
      ...(existing && existing.enrichment && typeof existing.enrichment === "object" && !Array.isArray(existing.enrichment)
        ? (existing.enrichment as Record<string, unknown>)
        : {}),
      [key]: data,
    } as Prisma.InputJsonValue;

    if (existing) {
      const entity = await prisma.entity.update({
        where: { id: existing.id },
        data: { enrichment: mergedEnrichment, status: "ENRICHED" },
      });
      return NextResponse.json({ entity, created: false });
    }

    const entity = await prisma.entity.create({
      data: {
        userId: user.id,
        name: name?.trim() || domain,
        domain,
        website: `https://${domain}`,
        status: "ENRICHED",
        source: "discover:enrichment",
        enrichment: mergedEnrichment,
      },
    });
    return NextResponse.json({ entity, created: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities/upsert-enrichment", e);
    return NextResponse.json({ error: "Failed to attach enrichment" }, { status: 500 });
  }
}
