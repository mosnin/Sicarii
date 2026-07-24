import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { dismissBreakupDraft } from "@/lib/breakup-operations";

// POST /api/breakup-drafts/[id]/dismiss - one-click dismiss. Human-session
// only, same reasoning as approve/route.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`breakup-dismiss:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const draft = await dismissBreakupDraft(user.id, id);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/breakup-drafts/[id]/dismiss", e);
    return NextResponse.json({ error: "Failed to dismiss draft" }, { status: 500 });
  }
}
