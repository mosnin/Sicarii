import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import {
  connectSmtpMailbox,
  listMailboxEvents,
  listMailboxes,
  requestPurchasedMailbox,
} from "@/lib/mailbox-operations";
import { enqueueOutreach } from "@/lib/mailbox-queue";

function op(e: unknown) {
  if (e instanceof NextResponse) return e;
  if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("mailboxes", e);
  return NextResponse.json({ error: "Mailbox request failed" }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const mailboxes = await listMailboxes(user.id);
    return NextResponse.json({ mailboxes });
  } catch (e) {
    return op(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`mailboxes-write:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      action?: string;
      email?: string;
      displayName?: string;
      alreadyWarm?: boolean;
      domainId?: string;
      localPart?: string;
      domainName?: string;
      smtp?: {
        host?: string;
        port?: number;
        secure?: boolean;
        username?: string;
        password?: string;
      };
      mailboxId?: string;
      contactId?: string;
      subject?: string;
      body?: string;
      variantId?: string;
      idempotencyKey?: string;
    } | null;

    if (body?.action === "events" && body.mailboxId) {
      const events = await listMailboxEvents(user.id, body.mailboxId);
      return NextResponse.json({ events });
    }

    if (body?.action === "connect") {
      if (!body.email || !body.smtp?.host || !body.smtp.username || !body.smtp.password) {
        return NextResponse.json({ error: "email and smtp host/username/password are required." }, { status: 400 });
      }
      const mailbox = await connectSmtpMailbox(user.id, {
        email: body.email,
        displayName: body.displayName,
        alreadyWarm: body.alreadyWarm,
        domainId: body.domainId,
        smtp: {
          host: body.smtp.host,
          port: body.smtp.port ?? 587,
          secure: Boolean(body.smtp.secure),
          username: body.smtp.username,
          password: body.smtp.password,
        },
      });
      return NextResponse.json({ mailbox }, { status: 201 });
    }

    if (body?.action === "enqueue") {
      if (!body.mailboxId || !body.contactId || !body.subject || !body.body) {
        return NextResponse.json({ error: "mailboxId, contactId, subject, and body are required." }, { status: 400 });
      }
      const job = await enqueueOutreach(user.id, {
        mailboxId: body.mailboxId,
        contactId: body.contactId,
        subject: body.subject,
        body: body.body,
        variantId: body.variantId,
        idempotencyKey: body.idempotencyKey,
      });
      return NextResponse.json(job, { status: 201 });
    }

    if (body?.action === "request") {
      if (!body.localPart) return NextResponse.json({ error: "localPart is required." }, { status: 400 });
      const result = await requestPurchasedMailbox(user.id, {
        localPart: body.localPart,
        domainId: body.domainId,
        domainName: body.domainName,
        displayName: body.displayName,
      });
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: "action must be connect or request." }, { status: 400 });
  } catch (e) {
    return op(e);
  }
}
