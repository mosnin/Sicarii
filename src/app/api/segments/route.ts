import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { createSegment, listSegments } from "@/lib/field-operations";

// GET /api/segments - list segments with member counts.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const segments = await listSegments(user.id);
    return NextResponse.json({ segments });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to list segments" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(2000).optional(),
  contactIds: z.array(z.string().uuid()).max(500).optional(),
});

// POST /api/segments - create a segment manually (optionally with members).
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`segments-create:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    const { name, goal, contactIds } = parsed.data;
    const segment = await createSegment(user.id, { name, goal, contactIds });

    return NextResponse.json({ segment }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/segments", e);
    return NextResponse.json({ error: "Failed to create segment" }, { status: 500 });
  }
}
