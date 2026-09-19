import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { isAgentPhoneConfigured } from "@/lib/agentphone";
import { OpError, listContactCalls } from "@/lib/crm-operations";

// GET /api/contacts/[id]/calls - the logged phone-call history for this contact.
// Returns { connected: false } when no AgentPhone key is set (UI shows a CTA).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const connected = isAgentPhoneConfigured(user.agentPhoneApiKey);
    const calls = await listContactCalls(user.id, id);
    return NextResponse.json({ connected, calls });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/contacts/[id]/calls", e);
    return NextResponse.json({ error: "Failed to load calls" }, { status: 500 });
  }
}
