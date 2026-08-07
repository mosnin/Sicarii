import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { disconnectConnection, setAutoCreateContacts } from "@/lib/connections";

export const runtime = "nodejs";

// DELETE /api/connections/[id] - disconnect a mailbox or calendar.
//
// Disables the triggers, deletes the connected account at Composio so the
// Google grant is genuinely revoked, and marks our rows REVOKED. Already-synced
// threads and meetings are KEPT: that is CRM history the operator built, and
// deleting it is a separate, explicit decision, not a side effect of turning
// off a sync.
//
// Next 16: params is a Promise, await it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    await disconnectConnection(user.id, id);
    return NextResponse.json({ disconnected: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/connections/[id]", e);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}

// PATCH /api/connections/[id] - the autoCreateContacts toggle.
//
// Off by default and kept human-only: creating a contact is a decision, not a
// side effect of syncing, so the decision to let sync make it must come from a
// person in Settings.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;

    let body: { autoCreateContacts?: unknown };
    try {
      body = (await req.json()) as { autoCreateContacts?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body.autoCreateContacts !== "boolean") {
      return NextResponse.json({ error: "autoCreateContacts must be true or false" }, { status: 400 });
    }

    const connection = await setAutoCreateContacts(user.id, id, body.autoCreateContacts);
    return NextResponse.json({ connection });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/connections/[id]", e);
    return NextResponse.json({ error: "Failed to update the connection" }, { status: 500 });
  }
}
