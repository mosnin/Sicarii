import { NextRequest, NextResponse } from "next/server";
import { OpError } from "@/lib/op-error";
import { enqueueMailboxJob, parseMailboxJob } from "@/lib/mailbox-jobs";
import { authorizeWorkerRequest } from "@/lib/worker-secret";
import { verifyPremiumInboxesSignature } from "@/lib/premium-inboxes";

// Public inbound ingest. Auth is WORKER_SECRET / CRON_SECRET, or the
// Premium Inboxes webhook signature when that secret is set.

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const workerOk = await authorizeWorkerRequest(req.headers.get("authorization"));
    const partnerHeader =
      req.headers.get("x-premium-inboxes-signature") ?? req.headers.get("x-signature");
    const partnerOk = partnerHeader ? verifyPremiumInboxesSignature(rawBody, partnerHeader) : false;
    if (!workerOk && !partnerOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (rawBody ? JSON.parse(rawBody) : {}) as {
      job?: unknown;
      from?: string;
      to?: string;
      subject?: string;
      text?: string;
      body?: string;
      mailboxId?: string;
      providerId?: string;
    };
    const job = parseMailboxJob(
      body.job ?? {
        type: "inbound-email",
        from: body.from,
        to: body.to,
        subject: body.subject,
        text: body.text ?? body.body,
        mailboxId: body.mailboxId,
        providerId: body.providerId,
      },
    );
    if (job.type !== "inbound-email") {
      return NextResponse.json({ error: "This webhook only accepts inbound-email jobs." }, { status: 400 });
    }
    const result = await enqueueMailboxJob(job);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/webhooks/inbound-email", e);
    return NextResponse.json({ error: "Inbound ingest failed" }, { status: 500 });
  }
}
