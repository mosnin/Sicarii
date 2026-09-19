import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { CONTACT_STATUSES, contactListWhere } from "@/lib/lead-org";
import { createContact, OpError } from "@/lib/crm-operations";

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
  list: z.string().trim().max(80).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  enrichment: z
    .record(z.string(), z.unknown())
    .refine((o) => JSON.stringify(o).length <= 100_000, "enrichment payload too large")
    .optional(),
  entityId: z.string().uuid().nullable().optional(),
});

function listFiltersFrom(searchParams: URLSearchParams) {
  return {
    q: searchParams.get("q")?.trim() || undefined,
    status: searchParams.get("status")?.trim() || undefined,
    source: searchParams.get("source")?.trim() || undefined,
    tag: searchParams.get("tag")?.trim() || undefined,
    list: searchParams.get("list")?.trim() || undefined,
    ownerId: searchParams.get("ownerId")?.trim() || undefined,
    segmentId: searchParams.get("segmentId")?.trim() || undefined,
    pipelineId: searchParams.get("pipelineId")?.trim() || undefined,
    stage: searchParams.get("stage")?.trim() || undefined,
  };
}

// GET /api/contacts - list the authenticated user's contacts.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const { searchParams } = new URL(req.url);
    const contacts = await prisma.contact.findMany({
      where: contactListWhere(user.id, listFiltersFrom(searchParams)),
      orderBy: { updatedAt: "desc" },
      // The enrichment blob (often KBs per row) belongs to GET /api/contacts/[id];
      // shipping it 500x per list call bloats payloads for no consumer.
      omit: { enrichment: true },
      take: 500,
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

    const contact = await createContact(user.id, parsed.data);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
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
