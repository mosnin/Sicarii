import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listAutopilotPlans } from "@/lib/autopilot-operations";

// GET /api/autopilot-plans - list the current user's autopilot plans
// (allocations + recent run ledger included) for the dashboard card.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const plans = await listAutopilotPlans(user.id);
    return NextResponse.json({ plans });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/autopilot-plans", e);
    return NextResponse.json({ error: "Failed to list autopilot plans" }, { status: 500 });
  }
}
