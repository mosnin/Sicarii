import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { verifyDomainDns } from "@/lib/mailbox-operations";

// POST /api/mail/domains/[id]/verify - re-run the live DNS check (SPF, DKIM,
// DMARC, MX) and, when the domain is on AgentMail, ask them to re-verify too.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    const rate = await checkRateLimit(`mail:domain:verify:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    return NextResponse.json({ domain: await verifyDomainDns(user.id, id) });
  } catch (e) {
    return mailError(e, "POST /api/mail/domains/[id]/verify");
  }
}
