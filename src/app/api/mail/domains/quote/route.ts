import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { quoteDomain } from "@/lib/mailbox-operations";

// GET /api/mail/domains/quote?domain=acme-outreach.com - availability and the
// all-in first-year price. Registrars rate-limit availability checks hard
// (Porkbun: one per 10 s per account), so this is throttled per user too.
export async function GET(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const rate = await checkRateLimit(`mail:domain:quote:${user.id}`, 12, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const domain = new URL(req.url).searchParams.get("domain")?.trim() ?? "";
    if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
    return NextResponse.json({ quote: await quoteDomain(domain) });
  } catch (e) {
    return mailError(e, "GET /api/mail/domains/quote");
  }
}
