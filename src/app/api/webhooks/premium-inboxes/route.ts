import { NextResponse } from "next/server";
import { fulfillMailboxProvision } from "@/lib/mailbox-operations";
import { verifyPremiumInboxesSignature } from "@/lib/premium-inboxes";

// Public webhook: Premium Inboxes (or a human fulfillment step) tells us an
// inbox is live. Signature required when PREMIUM_INBOXES_WEBHOOK_SECRET is set.

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const secret = process.env.PREMIUM_INBOXES_WEBHOOK_SECRET?.trim();
    if (secret) {
      const header = req.headers.get("x-premium-inboxes-signature") ?? req.headers.get("x-signature");
      if (!verifyPremiumInboxesSignature(rawBody, header)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody) as {
      orderId?: string;
      mailboxId?: string;
      email?: string;
      smtp?: {
        host?: string;
        port?: number;
        secure?: boolean;
        username?: string;
        password?: string;
      };
      providerInboxId?: string;
    };

    if (!body.email || (!body.orderId && !body.mailboxId)) {
      return NextResponse.json({ error: "email and orderId or mailboxId are required." }, { status: 400 });
    }

    const smtp =
      body.smtp?.host && body.smtp.username && body.smtp.password
        ? {
            host: body.smtp.host,
            port: body.smtp.port ?? 587,
            secure: Boolean(body.smtp.secure),
            username: body.smtp.username,
            password: body.smtp.password,
          }
        : undefined;

    const mailbox = await fulfillMailboxProvision({
      orderId: body.orderId,
      mailboxId: body.mailboxId,
      email: body.email,
      smtp,
      providerInboxId: body.providerInboxId,
    });
    return NextResponse.json({ mailbox });
  } catch (e) {
    console.error("POST /api/webhooks/premium-inboxes", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
