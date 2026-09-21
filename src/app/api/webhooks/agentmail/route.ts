import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/agentmail";
import { handleAgentMailEvent } from "@/lib/mailbox-operations";

// POST /api/webhooks/agentmail - AgentMail's event webhook for the platform
// organization (every inbox Scalar provisions). Signature is the auth: the
// secret returned when the webhook was registered (AGENTMAIL_WEBHOOK_SECRET)
// verifies the Svix-style svix-id / svix-timestamp / svix-signature headers.
// /api/webhooks(.*) is public in src/proxy.ts.
//
// Events handled (src/lib/mailbox-operations.ts handleAgentMailEvent):
//   message.received[.spam] -> ingest + classify + CRM side effect
//   message.bounced / message.complained -> mailbox health + do-not-contact
//   domain.verified -> re-run the DNS posture check
// Without the secret configured we return 501 rather than accept unsigned
// events; the 10-minute poller (syncMailInbound) covers inbound meanwhile.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "AGENTMAIL_WEBHOOK_SECRET is not set" }, { status: 501 });

  const raw = await req.text();
  const event = verifyWebhook(
    raw,
    {
      id: req.headers.get("svix-id") ?? req.headers.get("webhook-id"),
      timestamp: req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp"),
      signature: req.headers.get("svix-signature") ?? req.headers.get("webhook-signature"),
    },
    secret,
  );
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  try {
    const r = await handleAgentMailEvent(event);
    return NextResponse.json({ received: true, ...r });
  } catch (e) {
    console.error("[agentmail webhook]", e);
    // 500 so AgentMail retries; ingestInbound is idempotent on message id.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
