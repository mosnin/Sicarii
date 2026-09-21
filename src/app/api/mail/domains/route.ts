import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailError, requireMailUser } from "@/lib/mail/route-helpers";
import { addExternalDomain, listDomains } from "@/lib/mailbox-operations";

// GET /api/mail/domains - sending domains with their live DNS posture.
export async function GET(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    return NextResponse.json({ domains: await listDomains(user.id) });
  } catch (e) {
    return mailError(e, "GET /api/mail/domains");
  }
}

const schema = z.object({ domain: z.string().trim().min(4).max(253) });

// POST /api/mail/domains - bring a domain owned elsewhere. Buying one goes
// through POST /api/mail/orders (kind: "domain").
export async function POST(req: NextRequest) {
  try {
    const user = await requireMailUser(req);
    const rate = await checkRateLimit(`mail:domain:add:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return NextResponse.json({ domain: await addExternalDomain(user.id, parsed.data) }, { status: 201 });
  } catch (e) {
    return mailError(e, "POST /api/mail/domains");
  }
}
