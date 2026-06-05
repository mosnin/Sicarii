import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const ENTITY_STATUSES = ["NEW", "ENRICHED", "ARCHIVED"] as const;

const createEntitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional(),
  website: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  industry: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  size: z.string().trim().max(60).optional(),
  status: z.enum(ENTITY_STATUSES).optional(),
  source: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  notes: z.string().trim().max(10000).optional(),
  enrichment: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/entities — list the authenticated user's entities (with contact counts).
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    const entities = await prisma.entity.findMany({
      where: {
        userId: user.id,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { domain: { contains: q, mode: "insensitive" } },
                { industry: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { contacts: true } } },
      take: 500,
    });

    return NextResponse.json({ entities });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/entities", e);
    return NextResponse.json({ error: "Failed to list entities" }, { status: 500 });
  }
}

// POST /api/entities — create an entity.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = checkRateLimit(`entities:create:${user.id}`, 60, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const json = await req.json().catch(() => null);
    const parsed = createEntitySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid entity", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { enrichment, tags, ...rest } = parsed.data;
    const entity = await prisma.entity.create({
      data: {
        ...rest,
        tags: tags ?? [],
        ...(enrichment
          ? { enrichment: enrichment as Prisma.InputJsonValue }
          : {}),
        userId: user.id,
      },
    });

    return NextResponse.json({ entity }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/entities", e);
    return NextResponse.json({ error: "Failed to create entity" }, { status: 500 });
  }
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

// DELETE /api/entities — bulk-delete the user's companies (contacts are detached
// via the schema's onDelete: SetNull, not deleted).
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Provide ids: string[]" }, { status: 400 });
    }
    const result = await prisma.entity.deleteMany({
      where: { userId: user.id, id: { in: parsed.data.ids } },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/entities", e);
    return NextResponse.json({ error: "Failed to delete entities" }, { status: 500 });
  }
}
