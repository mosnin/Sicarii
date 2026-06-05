import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

const ENTITY_STATUSES = ["NEW", "ENRICHED", "ARCHIVED"] as const;

const updateEntitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().max(255).nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  logoUrl: z.string().trim().max(1000).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  size: z.string().trim().max(60).nullable().optional(),
  status: z.enum(ENTITY_STATUSES).optional(),
  source: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  enrichment: z.record(z.string(), z.unknown()).nullable().optional(),
});

async function getOwnedEntity(id: string, userId: string) {
  const entity = await prisma.entity.findUnique({ where: { id } });
  if (!entity || entity.userId !== userId) return null;
  return entity;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const entity = await getOwnedEntity(id, user.id);
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const contacts = await prisma.contact.findMany({
      where: { entityId: id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ entity, contacts });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/entities/[id]", e);
    return NextResponse.json({ error: "Failed to load entity" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const existing = await getOwnedEntity(id, user.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const json = await req.json().catch(() => null);
    const parsed = updateEntitySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { enrichment, ...rest } = parsed.data;
    const data: Prisma.EntityUncheckedUpdateInput = { ...rest };
    if (enrichment !== undefined) {
      data.enrichment =
        enrichment === null ? Prisma.DbNull : (enrichment as Prisma.InputJsonValue);
    }
    const entity = await prisma.entity.update({ where: { id }, data });
    return NextResponse.json({ entity });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("PATCH /api/entities/[id]", e);
    return NextResponse.json({ error: "Failed to update entity" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const existing = await getOwnedEntity(id, user.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Contacts are detached (entityId -> null) by the schema's onDelete: SetNull.
    await prisma.entity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/entities/[id]", e);
    return NextResponse.json({ error: "Failed to delete entity" }, { status: 500 });
  }
}
