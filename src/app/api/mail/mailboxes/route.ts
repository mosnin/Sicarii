import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { createAgentMailMailbox, importSmtpMailbox, listMailboxes } from "@/lib/mailbox-operations";

// GET /api/mail/mailboxes - the account's agent mailboxes (never credentials).
export async function GET(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    return NextResponse.json({ mailboxes: await listMailboxes(user.id) });
  } catch (e) {
    return mailError(e, "GET /api/mail/mailboxes");
  }
}

const createSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("agentmail"),
    username: z.string().trim().min(1).max(64),
    domainId: z.string().uuid().nullable().optional(),
    displayName: z.string().trim().max(120).nullable().optional(),
    dailyCap: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    provider: z.literal("smtp"),
    address: z.string().trim().email().max(254),
    password: z.string().min(4).max(500),
    displayName: z.string().trim().max(120).nullable().optional(),
    username: z.string().trim().max(254).nullable().optional(),
    smtpHost: z.string().trim().max(253).nullable().optional(),
    smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
    imapHost: z.string().trim().max(253).nullable().optional(),
    imapPort: z.number().int().min(1).max(65535).nullable().optional(),
    providerHint: z.enum(["google", "microsoft"]).nullable().optional(),
    dailyCap: z.number().int().min(1).max(200).optional(),
  }),
]);

// POST /api/mail/mailboxes - create an AgentMail inbox on a verified domain,
// or bring an SMTP/IMAP mailbox (credentials verified live, then sealed).
export async function POST(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const rate = await checkRateLimit(`mail:mailbox:create:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    const body = parsed.data;
    const mailbox =
      body.provider === "agentmail"
        ? await createAgentMailMailbox(user.id, body)
        : await importSmtpMailbox(user.id, body);
    return NextResponse.json({ mailbox }, { status: 201 });
  } catch (e) {
    return mailError(e, "POST /api/mail/mailboxes");
  }
}
