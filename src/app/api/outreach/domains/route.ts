// Outreach domains: search, quote, pay (Card 0015).
//
// GET  /api/outreach/domains — list your domains + mailbox counts.
// POST /api/outreach/domains — { action: "search" | "quote" | "checkout" }.
//   search:   GoDaddy availability + suggestions (free read, 501 without key).
//   quote:    locks a price (10-min GoDaddy quoteToken) + creates the
//             OutreachDomain (pending_payment) + DomainOrder.
//   checkout: Stripe one-off (quote + disclosed $5 service fee); the Stripe
//             webhook completes the GoDaddy registration, never this route.
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import {
  searchOutreachDomains,
  quoteOutreachDomain,
  createDomainCheckout,
  listOutreachDomains,
} from "@/lib/outreach-operations";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    return NextResponse.json({ domains: await listOutreachDomains(ctx.account.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/outreach/domains", e);
    return NextResponse.json({ error: "Failed to list domains" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.account;

    const rate = await checkRateLimit(`outreach-domains:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      action?: string;
      query?: string;
      domain?: string;
      periodYears?: number;
      orderId?: string;
    } | null;
    const action = body?.action;
    if (action === "search") {
      if (!body?.query) return NextResponse.json({ error: "query is required" }, { status: 400 });
      return NextResponse.json(await searchOutreachDomains(user.id, body.query));
    }
    if (action === "quote") {
      if (!body?.domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
      return NextResponse.json(await quoteOutreachDomain(user.id, { domain: body.domain, periodYears: body.periodYears }));
    }
    if (action === "checkout") {
      if (!body?.orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
      return NextResponse.json(await createDomainCheckout(user.id, body.orderId, { email: user.email }));
    }
    return NextResponse.json({ error: "action must be search, quote, or checkout" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/outreach/domains", e);
    return NextResponse.json({ error: "Domain request failed" }, { status: 500 });
  }
}
