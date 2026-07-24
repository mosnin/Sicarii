import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { updateBreakupDraft } from "@/lib/breakup-operations";

const patchSchema = z.object({
  subject: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
});

// PATCH /api/breakup-drafts/[id] - edit a pending draft's subject/body before
// approving (a human refining Scalar's wording). Human-session only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`breakup-edit:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
    }

    const draft = await updateBreakupDraft(user.id, id, parsed.data);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/breakup-drafts/[id]", e);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}
