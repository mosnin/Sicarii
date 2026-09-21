import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { sendMail } from "@/lib/mailbox-operations";

// POST /api/mail/send - send one email from an agent mailbox. Same guards as
// the MCP send_email tool (this is the same sendMail): do-not-contact, cold
// daily cap, health, 1 credit per cold send. Pass replyToMessageId to answer
// an inbound message in-thread (uncapped, unmetered).
const schema = z
  .object({
    mailboxId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    to: z.string().trim().email().max(254).nullable().optional(),
    subject: z.string().trim().min(1).max(300),
    text: z.string().trim().min(1).max(50_000),
    html: z.string().max(200_000).nullable().optional(),
    variantId: z.string().uuid().nullable().optional(),
    replyToMessageId: z.string().uuid().nullable().optional(),
  })
  .refine((b) => b.contactId || b.to || b.replyToMessageId, { message: "Provide contactId, to, or replyToMessageId" });

export async function POST(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const rate = await checkRateLimit(`mail:send:${user.id}`, 60, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    const result = await sendMail(user.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return mailError(e, "POST /api/mail/send");
  }
}
