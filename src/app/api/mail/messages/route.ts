import { NextRequest, NextResponse } from "next/server";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { listMessages } from "@/lib/mailbox-operations";
import type { InboundClassName } from "@/lib/mail/classify";

const CLASSES = new Set(["REPLY", "AUTO_REPLY", "OUT_OF_OFFICE", "BOUNCE", "UNSUBSCRIBE", "WARMUP", "OTHER"]);

// GET /api/mail/messages?mailboxId=&contactId=&direction=INBOUND&classification=REPLY&since=ISO&limit=50
// The unified inbox across the account's mailboxes (warmup traffic hidden
// unless includeWarmup=1).
export async function GET(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const p = new URL(req.url).searchParams;
    const direction = p.get("direction");
    const klass = p.get("classification");
    const since = p.get("since");
    const limit = Number.parseInt(p.get("limit") ?? "", 10);
    const messages = await listMessages(user.id, {
      mailboxId: p.get("mailboxId"),
      contactId: p.get("contactId"),
      direction: direction === "INBOUND" || direction === "OUTBOUND" ? direction : null,
      classification: klass && CLASSES.has(klass) ? (klass as InboundClassName) : null,
      since: since && !Number.isNaN(Date.parse(since)) ? new Date(since) : null,
      includeWarmup: p.get("includeWarmup") === "1",
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ messages });
  } catch (e) {
    return mailError(e, "GET /api/mail/messages");
  }
}
