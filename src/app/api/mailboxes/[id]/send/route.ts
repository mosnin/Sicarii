import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { sendOutreachEmail } from "@/lib/mailbox-operations";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await ctx.params;
    const rate = await checkRateLimit(`mailbox-send:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      contactId?: string;
      subject?: string;
      body?: string;
      variantId?: string;
    } | null;
    if (!body?.contactId || !body.subject || !body.body) {
      return NextResponse.json({ error: "contactId, subject, and body are required." }, { status: 400 });
    }

    const result = await sendOutreachEmail(user.id, {
      contactId: body.contactId,
      subject: body.subject,
      body: body.body,
      mailboxId: id,
      variantId: body.variantId ?? null,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/mailboxes/[id]/send", e);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
