import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import {
  getMailbox,
  listMailboxEvents,
  markMailboxReady,
  pauseMailbox,
  resumeMailbox,
} from "@/lib/mailbox-operations";

function op(e: unknown) {
  if (e instanceof NextResponse) return e;
  if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("mailbox id", e);
  return NextResponse.json({ error: "Mailbox request failed" }, { status: 500 });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await ctx.params;
    const mailbox = await getMailbox(user.id, id);
    const events = await listMailboxEvents(user.id, id, 30);
    return NextResponse.json({ mailbox, events });
  } catch (e) {
    return op(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { action?: string } | null;
    if (body?.action === "pause") return NextResponse.json({ mailbox: await pauseMailbox(user.id, id) });
    if (body?.action === "resume") return NextResponse.json({ mailbox: await resumeMailbox(user.id, id) });
    if (body?.action === "mark_ready") return NextResponse.json({ mailbox: await markMailboxReady(user.id, id) });
    return NextResponse.json({ error: "action must be pause, resume, or mark_ready." }, { status: 400 });
  } catch (e) {
    return op(e);
  }
}
