import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { connectDomainToAgentMail, pushDnsRecords } from "@/lib/mailbox-operations";

// POST /api/mail/domains/[id]/connect - register the domain with AgentMail so
// inboxes can live on it. Returns the DNS records to publish; when Scalar
// bought the domain they are pushed to the registrar automatically.
// Body { pushOnly: true } re-pushes the stored records without re-registering.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMailUser(req);
    const { id } = await params;
    const rate = await checkRateLimit(`mail:domain:connect:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const body = (await req.json().catch(() => ({}))) as { pushOnly?: boolean };
    if (body?.pushOnly) return NextResponse.json(await pushDnsRecords(user.id, id));
    return NextResponse.json({ domain: await connectDomainToAgentMail(user.id, id) });
  } catch (e) {
    return mailError(e, "POST /api/mail/domains/[id]/connect");
  }
}
