import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { pauseAutopilotPlan } from "@/lib/autopilot-operations";
import { OpError } from "@/lib/crm-operations";

// POST /api/autopilot-plans/[id]/pause - human-triggered pause from the
// dashboard (the Pause button). An agent can also pause its own plan, but
// only via the MCP pause_autopilot tool - not this REST route, which is
// session-gated the same way every other dashboard mutation is.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`autopilot-pause:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const label = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
    const plan = await pauseAutopilotPlan(user.id, id, { actor: { id: user.id, label } });
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/autopilot-plans/[id]/pause", e);
    return NextResponse.json({ error: "Failed to pause plan" }, { status: 500 });
  }
}
