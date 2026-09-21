import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAddonCheckoutSession, mailboxPriceId, stripeConfigured } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.account;
    const rate = await checkRateLimit(`mailbox-checkout:${user.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      localPart?: string;
      domainId?: string;
      domainName?: string;
      displayName?: string;
    } | null;
    if (!body?.localPart?.trim()) {
      return NextResponse.json({ error: "localPart is required." }, { status: 400 });
    }
    if (!body.domainId && !body.domainName) {
      return NextResponse.json({ error: "domainId or domainName is required." }, { status: 400 });
    }

    if (!stripeConfigured()) {
      return NextResponse.json({ error: "Billing is not configured yet." }, { status: 501 });
    }
    const priceId = mailboxPriceId();
    if (!priceId) {
      return NextResponse.json(
        { error: "Mailbox billing is not configured yet (STRIPE_PRICE_MAILBOX)." },
        { status: 501 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
    const result = await createAddonCheckoutSession({
      priceId,
      userId: user.id,
      mode: "subscription",
      successUrl: `${appUrl}/mailboxes?purchased=1`,
      cancelUrl: `${appUrl}/mailboxes?checkout=cancelled`,
      metadata: {
        type: "mailbox",
        localPart: body.localPart.trim().toLowerCase(),
        domainId: body.domainId ?? "",
        domainName: body.domainName ?? "",
        displayName: body.displayName ?? "",
      },
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ url: result.url });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/mailboxes/checkout", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
