// Bird delivery webhook (Card 0015).
//
// POST /api/webhooks/bird — async per-recipient outcomes (delivered, bounced,
// complained, opened, ...). Auth is HMAC-SHA256 over the RAW body with
// BIRD_WEBHOOK_SECRET (timing-safe compare); without the secret configured the
// route fails closed (503) rather than accepting unsigned delivery events.
// This route's job is auth ONLY — parsing + state updates live in
// ingestBirdWebhook so the logic is unit-testable without HTTP.
import { NextRequest, NextResponse } from "next/server";
import { verifyBirdSignature } from "@/lib/outreach/bird";
import { ingestBirdWebhook } from "@/lib/outreach-send";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.BIRD_WEBHOOK_SECRET?.trim()) {
      console.error("BIRD_WEBHOOK_SECRET is not set");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
    }
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-bird-signature") ?? req.headers.get("bird-signature") ?? req.headers.get("signature");
    if (!verifyBirdSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    let payload: unknown;
    try {
      payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const result = await ingestBirdWebhook(payload);
    return NextResponse.json({ received: true, handled: result.handled });
  } catch (e) {
    console.error("Bird webhook error", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
