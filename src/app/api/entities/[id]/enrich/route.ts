import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  enrichCompany,
  isSynthozConfigured,
  SynthozNotConfiguredError,
} from "@/lib/synthoz";

// POST /api/entities/[id]/enrich — enrich a business via Synthoz using its domain.
// Stores the raw provider payload on entity.enrichment and marks it ENRICHED.
// (Parsing the payload into Contact records is refined once we see real responses.)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const entity = await prisma.entity.findUnique({ where: { id } });
    if (!entity || entity.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!entity.domain) {
      return NextResponse.json(
        { error: "This entity has no domain to enrich from." },
        { status: 400 }
      );
    }
    if (!isSynthozConfigured()) {
      return NextResponse.json(
        { error: "Synthoz is not configured yet (SYNTHOZ_API_KEY missing)." },
        { status: 501 }
      );
    }

    const result = await enrichCompany(entity.domain);

    const updated = await prisma.entity.update({
      where: { id },
      data: {
        status: "ENRICHED",
        enrichment: result as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ entity: updated });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof SynthozNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    console.error("POST /api/entities/[id]/enrich", e);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 502 });
  }
}
