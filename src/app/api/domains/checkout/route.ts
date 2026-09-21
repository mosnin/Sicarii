import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPlausibleDomain } from "@/lib/godaddy";
import { createAddonCheckoutSession, domainPriceId, stripeConfigured } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.account;
    const rate = await checkRateLimit(`domain-checkout:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as { domain?: string } | null;
    const domain = body?.domain?.trim().toLowerCase() ?? "";
    if (!isPlausibleDomain(domain)) {
      return NextResponse.json({ error: "domain must be a valid name (example.com)." }, { status: 400 });
    }

    if (!stripeConfigured()) {
      return NextResponse.json({ error: "Billing is not configured yet." }, { status: 501 });
    }
    const priceId = domainPriceId();
    if (!priceId) {
      return NextResponse.json(
        { error: "Domain billing is not configured yet (STRIPE_PRICE_DOMAIN)." },
        { status: 501 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
    const result = await createAddonCheckoutSession({
      priceId,
      userId: user.id,
      mode: "payment",
      successUrl: `${appUrl}/mailboxes?domain=1`,
      cancelUrl: `${appUrl}/mailboxes?checkout=cancelled`,
      metadata: { type: "domain", domainName: domain },
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ url: result.url });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/domains/checkout", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
