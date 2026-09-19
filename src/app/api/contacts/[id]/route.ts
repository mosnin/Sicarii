import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError, deleteContact, getContact, updateContact } from "@/lib/crm-operations";

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
  facebook: z.string().trim().max(500).nullable().optional(),
  instagram: z.string().trim().max(500).nullable().optional(),
  twitter: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  source: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  enrichment: z.record(z.string(), z.unknown()).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const row = await getContact(user.id, id, { includeChannelHistory: true });
    const { emails, socialMessages: _social, ...contact } = row as typeof row & {
      emails?: unknown;
      socialMessages?: unknown;
    };
    return NextResponse.json({ contact, emails: emails ?? [] });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
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

    const json = await req.json().catch(() => null);
    const parsed = updateContactSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const contact = await updateContact(user.id, id, parsed.data);
    return NextResponse.json({ contact });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
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
    await deleteContact(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/contacts/[id]", e);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
