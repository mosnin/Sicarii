import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { approveBreakupDraft } from "@/lib/breakup-operations";

// POST /api/breakup-drafts/[id]/approve - one-click approve. Deliberately
// human-session ONLY: getAuthenticatedUser resolves a Clerk session, never an
// agent API key, so a prompt-injected agent can never approve (and thereby
// send) its own draft. See src/lib/breakup-operations.ts for the AgentMail
// send-capability note.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`breakup-approve:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const draft = await approveBreakupDraft(user.id, id);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/breakup-drafts/[id]/approve", e);
    return NextResponse.json({ error: "Failed to approve draft" }, { status: 500 });
  }
}
