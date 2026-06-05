import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { getThreadsForContact, isAgentMailConfigured } from "@/lib/agentmail";

// GET /api/contacts/[id]/emails - AgentMail threads involving this contact.
// Returns { connected: false } when no AgentMail key is set (UI shows a CTA).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact || contact.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const key = user.agentMailApiKey;
    if (!isAgentMailConfigured(key)) {
      return NextResponse.json({ connected: false });
    }
    if (!contact.email) {
      return NextResponse.json({ connected: true, threads: [], note: "This contact has no email address." });
    }

    try {
      const threads = await getThreadsForContact(key as string, contact.email);
      return NextResponse.json({ connected: true, threads });
    } catch (e) {
      console.error("AgentMail fetch failed", e);
      return NextResponse.json({ connected: true, threads: [], error: "Couldn't load AgentMail threads." });
    }
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/contacts/[id]/emails", e);
    return NextResponse.json({ error: "Failed to load emails" }, { status: 500 });
  }
}
