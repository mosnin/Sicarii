import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { addActivity, OpError } from "@/lib/crm-operations";

const schema = z.object({
  body: z.string().trim().min(1).max(4000),
  kind: z.enum(["note", "call", "outreach", "reply"]).default("note"),
  channel: z.string().trim().max(40).optional(),
});

// POST /api/contacts/[id]/activities - log an activity (default: a note) on a
// contact. Backs the QuickNote morph surface on the contact page; ownership is
// enforced inside addActivity.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`activities:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid activity" }, { status: 400 });

    const activity = await addActivity(user.id, {
      contactId: id,
      kind: parsed.data.kind,
      body: parsed.data.body,
      channel: parsed.data.channel ?? null,
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/contacts/[id]/activities", e);
    return NextResponse.json({ error: "Failed to log activity" }, { status: 500 });
  }
}
