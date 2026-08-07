import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { listConnections } from "@/lib/connections";

export const runtime = "nodejs";

// GET /api/connections - the tenant's connected mailboxes and calendars, plus
// which providers this deployment can actually offer, so Settings never shows
// a Connect button that cannot work. Human-session only: connecting a mailbox
// is consent, and consent is given by a person, never by an agent key.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    return NextResponse.json(await listConnections(user.id));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/connections", e);
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}
