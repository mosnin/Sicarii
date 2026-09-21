import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { deleteMailbox, getMailbox, syncMailbox, updateMailbox } from "@/lib/mailbox-operations";

type Params = { params: Promise<{ id: string }> };

// GET /api/mail/mailboxes/[id] - one mailbox with its warmup/health view.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    return NextResponse.json({ mailbox: await getMailbox(user.id, id) });
  } catch (e) {
    return mailError(e, "GET /api/mail/mailboxes/[id]");
  }
}

const patchSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  dailyCap: z.number().int().min(1).max(200).optional(),
  warmupEnabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  /** Pull inbound mail now instead of waiting for the 10-minute poller. */
  sync: z.boolean().optional(),
});

// PATCH /api/mail/mailboxes/[id] - pause/resume, cap, warmup toggle, or sync.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    const { sync, ...patch } = parsed.data;
    let mailbox = await updateMailbox(user.id, id, patch);
    let synced: { ingested: number; rescued: number } | undefined;
    if (sync) {
      synced = await syncMailbox(mailbox.id);
      mailbox = await getMailbox(user.id, id);
    }
    return NextResponse.json({ mailbox, ...(synced ? { synced } : {}) });
  } catch (e) {
    return mailError(e, "PATCH /api/mail/mailboxes/[id]");
  }
}

// DELETE /api/mail/mailboxes/[id] - remove the mailbox (and the provider
// inbox for AgentMail). Message history goes with it.
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    return NextResponse.json(await deleteMailbox(user.id, id));
  } catch (e) {
    return mailError(e, "DELETE /api/mail/mailboxes/[id]");
  }
}
