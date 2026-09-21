// Outreach mailboxes: order, confirm, list (Card 0015).
//
// GET  /api/outreach/mailboxes — your mailboxes with warmup state + domain health.
// POST /api/outreach/mailboxes — { action: "order" | "confirm" }.
//   order:   DFY inbox order on one of your domains (PremiumInboxes API mode
//            when PREMIUMINBOXES_API_KEY is set, manual intake CSV otherwise).
//   confirm: ops confirms a fulfilled order with the delivered addresses
//            (flips rows to warming day 1; idempotent).
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { orderMailboxes, confirmMailboxOrder, listMailboxes } from "@/lib/outreach-operations";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    return NextResponse.json({ mailboxes: await listMailboxes(ctx.account.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/outreach/mailboxes", e);
    return NextResponse.json({ error: "Failed to list mailboxes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.account;

    const rate = await checkRateLimit(`outreach-mailboxes:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      action?: string;
      domainId?: string;
      count?: number;
      platform?: "google" | "microsoft";
      localParts?: string[];
      sequencerTarget?: string;
      orderId?: string;
      emails?: string[];
    } | null;
    if (body?.action === "order") {
      if (!body.domainId || !body.count)
        return NextResponse.json({ error: "domainId and count are required" }, { status: 400 });
      return NextResponse.json(
        await orderMailboxes(user.id, {
          domainId: body.domainId,
          count: body.count,
          platform: body.platform,
          localParts: body.localParts,
          sequencerTarget: body.sequencerTarget,
        }),
      );
    }
    if (body?.action === "confirm") {
      if (!body.orderId || !Array.isArray(body.emails))
        return NextResponse.json({ error: "orderId and emails[] are required" }, { status: 400 });
      return NextResponse.json(await confirmMailboxOrder(user.id, body.orderId, body.emails));
    }
    return NextResponse.json({ error: "action must be order or confirm" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/outreach/mailboxes", e);
    return NextResponse.json({ error: "Mailbox request failed" }, { status: 500 });
  }
}
