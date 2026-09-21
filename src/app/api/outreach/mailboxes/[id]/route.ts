// One mailbox: status, pause, resume (Card 0015).
//
// GET   /api/outreach/mailboxes/[id] — mailbox + warmup summary + domain health.
// PATCH /api/outreach/mailboxes/[id] — { action: "pause" | "resume" }.
// Burned mailboxes stay retired (a burned domain asset is never resurrected by
// an API call — human review only).
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { pauseMailbox, resumeMailbox, listMailboxes } from "@/lib/outreach-operations";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;
    const mailboxes = await listMailboxes(ctx.account.id);
    const mailbox = mailboxes.find((m) => m.id === id);
    if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    return NextResponse.json({ mailbox });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/outreach/mailboxes/[id]", e);
    return NextResponse.json({ error: "Failed to load mailbox" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.account;
    const { id } = await params;

    const rate = await checkRateLimit(`outreach-mailbox:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as { action?: string; why?: string } | null;
    if (body?.action === "pause") return NextResponse.json(await pauseMailbox(user.id, id, body.why));
    if (body?.action === "resume") return NextResponse.json(await resumeMailbox(user.id, id));
    return NextResponse.json({ error: "action must be pause or resume" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/outreach/mailboxes/[id]", e);
    return NextResponse.json({ error: "Mailbox update failed" }, { status: 500 });
  }
}
