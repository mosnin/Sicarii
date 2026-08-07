import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { dismissSocialOpportunity } from "@/lib/social-opportunities";

// POST /api/social/opportunities/[id]/dismiss - one-click "not a signal".
// Human-session only, same reasoning as the breakup queue: the queue exists so
// a person settles what a provider could not.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`social-dismiss:${user.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const opportunity = await dismissSocialOpportunity(user.id, id);
    return NextResponse.json({ opportunity });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/social/opportunities/[id]/dismiss", e);
    return NextResponse.json({ error: "Failed to dismiss opportunity" }, { status: 500 });
  }
}
