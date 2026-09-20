import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { isAgentPhoneConfigured } from "@/lib/agentphone";
import { listContactCalls } from "@/lib/crm-operations";

// GET /api/contacts/[id]/calls - the logged phone-call history for this contact.
// Returns { connected: false } when no AgentPhone key is set (UI shows a CTA).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact || contact.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const connected = isAgentPhoneConfigured(user.agentPhoneApiKey);
    const calls = await listContactCalls(user.id, id);
    return NextResponse.json({ connected, calls });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/contacts/[id]/calls", e);
    return NextResponse.json({ error: "Failed to load calls" }, { status: 500 });
  }
}
