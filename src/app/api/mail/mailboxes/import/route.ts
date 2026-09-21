import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { importInboxCredentials, parseInboxCsv } from "@/lib/mailbox-operations";

// POST /api/mail/mailboxes/import - bulk-import inbox credentials, either as
// the CSV a vendor (PremiumInboxes) delivers or as explicit rows. Each row is
// verified against SMTP/IMAP before it is stored; failures are reported per
// address so one bad password does not sink the batch. Optionally ties the
// inboxes to the order that paid for them.
const rowSchema = z.object({
  address: z.string().trim().email().max(254),
  password: z.string().min(4).max(500),
  displayName: z.string().trim().max(120).nullable().optional(),
  smtpHost: z.string().trim().max(253).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  imapHost: z.string().trim().max(253).nullable().optional(),
  imapPort: z.number().int().min(1).max(65535).nullable().optional(),
});

const schema = z.object({
  orderId: z.string().uuid().nullable().optional(),
  providerHint: z.enum(["google", "microsoft"]).nullable().optional(),
  csv: z.string().max(200_000).optional(),
  rows: z.array(rowSchema).max(25).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const rate = await checkRateLimit(`mail:import:${user.id}`, 5, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    const rows = parsed.data.rows ?? (parsed.data.csv ? parseInboxCsv(parsed.data.csv) : []);
    const result = await importInboxCredentials(user.id, {
      orderId: parsed.data.orderId ?? null,
      providerHint: parsed.data.providerHint ?? null,
      rows,
    });
    return NextResponse.json(result, { status: result.imported.length ? 201 : 200 });
  } catch (e) {
    return mailError(e, "POST /api/mail/mailboxes/import");
  }
}
