import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { addSegmentMembers, removeSegmentMember } from "@/lib/field-operations";
import { OpError } from "@/lib/crm-operations";
import { checkRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500),
  op: z.enum(["add", "remove"]).default("add"),
});

// POST /api/segments/[id]/members  { contactIds, op: "add" | "remove" }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`segment-members:${user.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid members payload" }, { status: 400 });

    if (parsed.data.op === "remove") {
      for (const contactId of parsed.data.contactIds) {
        await removeSegmentMember(user.id, id, contactId);
      }
      return NextResponse.json({ ok: true, removed: parsed.data.contactIds.length });
    }

    const result = await addSegmentMembers(user.id, id, parsed.data.contactIds);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/segments/[id]/members", e);
    return NextResponse.json({ error: "Failed to update list members" }, { status: 500 });
  }
}
