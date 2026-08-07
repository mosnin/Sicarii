import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { convertSocialOpportunity } from "@/lib/social-opportunities";

// POST /api/social/opportunities/[id]/convert - attach a reviewed opportunity
// to a contact or company the operator ALREADY has.
//
// This route creates nothing. A post author is a display name on a page: the
// provider returns no confidence, no match score and no verification, so there
// is no honest way to turn one into a CRM record. The caller supplies an
// identity they have already verified, or the conversion is refused.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`social-convert:${user.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const opportunity = await convertSocialOpportunity(user.id, id, {
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      entityId: typeof body.entityId === "string" ? body.entityId : null,
    });
    return NextResponse.json({ opportunity });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/social/opportunities/[id]/convert", e);
    return NextResponse.json({ error: "Failed to convert opportunity" }, { status: 500 });
  }
}
