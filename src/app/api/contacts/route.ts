import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError, listContacts, createContact } from "@/lib/crm-operations";

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

const createContactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  company: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  linkedin: z.string().trim().max(500).optional(),
  facebook: z.string().trim().max(500).optional(),
  instagram: z.string().trim().max(500).optional(),
  twitter: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  source: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  notes: z.string().trim().max(10000).optional(),
  enrichment: z
    .record(z.string(), z.unknown())
    .refine((o) => JSON.stringify(o).length <= 100_000, "enrichment payload too large")
    .optional(),
  entityId: z.string().uuid().nullable().optional(),
});

// GET /api/contacts - list the authenticated user's contacts.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();
    const rawLimit = Number(searchParams.get("limit"));

    const contacts = await listContacts(user.id, {
      q: q || undefined,
      status: status || undefined,
      limit: Number.isFinite(rawLimit) ? rawLimit : 500,
      ceiling: 500,
    });

    return NextResponse.json({ contacts });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/contacts", e);
    return NextResponse.json({ error: "Failed to list contacts" }, { status: 500 });
  }
}

// POST /api/contacts - create a contact.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`contacts:create:${user.id}`, 60, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const json = await req.json().catch(() => null);
    const parsed = createContactSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid contact", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { enrichment, tags, entityId, ...rest } = parsed.data;
    try {
      const contact = await createContact(user.id, {
        ...rest,
        tags,
        enrichment,
        entityId: entityId ?? null,
      });
      return NextResponse.json({ contact }, { status: 201 });
    } catch (e) {
      if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/contacts", e);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

// DELETE /api/contacts - bulk-delete the authenticated user's contacts by id.
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const parsed = bulkDeleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Provide ids: string[]" }, { status: 400 });
    }
    const result = await prisma.contact.deleteMany({
      where: { userId: user.id, id: { in: parsed.data.ids } },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/contacts", e);
    return NextResponse.json({ error: "Failed to delete contacts" }, { status: 500 });
  }
}
