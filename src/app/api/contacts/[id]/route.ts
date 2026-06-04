import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

const CONTACT_STATUSES = [
  "NEW",
  "ENRICHED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
  "ARCHIVED",
] as const;

const updateContactSchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  company: z.string().trim().max(200).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  linkedin: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  source: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  enrichment: z.record(z.string(), z.unknown()).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
});

// Load a contact and assert the authenticated user owns it.
async function getOwnedContact(id: string, userId: string) {
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact || contact.userId !== userId) return null;
  return contact;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const contact = await getOwnedContact(id, user.id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const emails = await prisma.contactEmail.findMany({
      where: { contactId: id },
      orderBy: { sentAt: "desc" },
    });
    return NextResponse.json({ contact, emails });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/contacts/[id]", e);
    return NextResponse.json({ error: "Failed to load contact" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const existing = await getOwnedContact(id, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const json = await req.json().catch(() => null);
    const parsed = updateContactSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { enrichment, entityId, ...rest } = parsed.data;

    // If (re)assigning an entity, it must belong to this user.
    if (entityId) {
      const entity = await prisma.entity.findUnique({ where: { id: entityId } });
      if (!entity || entity.userId !== user.id) {
        return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
      }
    }

    const data: Prisma.ContactUncheckedUpdateInput = { ...rest };
    if (entityId !== undefined) data.entityId = entityId;
    if (enrichment !== undefined) {
      data.enrichment =
        enrichment === null ? Prisma.DbNull : (enrichment as Prisma.InputJsonValue);
    }

    const contact = await prisma.contact.update({ where: { id }, data });

    return NextResponse.json({ contact });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("PATCH /api/contacts/[id]", e);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const existing = await getOwnedContact(id, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.contact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/contacts/[id]", e);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
