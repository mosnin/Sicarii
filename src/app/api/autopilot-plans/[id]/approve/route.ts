import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { approveAutopilotPlan } from "@/lib/autopilot-operations";
import { OpError } from "@/lib/crm-operations";

// POST /api/autopilot-plans/[id]/approve - flip a draft/paused/exhausted plan
// to active and open its first budget window.
//
// HUMAN-ONLY BY CONSTRUCTION: getAuthenticatedUser() resolves strictly from
// the Clerk session cookie (src/lib/auth-utils.ts -> auth() from
// @clerk/nextjs/server) - it has no Authorization: Bearer fallback, so a
// connected agent holding only an API key can never reach this route. There
// is also no MCP tool that calls approveAutopilotPlan; an agent can propose a
// plan and can pause one, but it can never approve its own spend.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const rate = await checkRateLimit(`autopilot-approve:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const label = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
    const plan = await approveAutopilotPlan(user.id, id, { id: user.id, label });
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/autopilot-plans/[id]/approve", e);
    return NextResponse.json({ error: "Failed to approve plan" }, { status: 500 });
  }
}
