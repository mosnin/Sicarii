import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCheckoutSession, priceIdFor, stripeConfigured } from "@/lib/stripe";
import type { PaidPlanName } from "@/lib/credits";

const PAID_PLANS = ["starter", "pro", "business"] as const;

// POST /api/billing/checkout  body: { plan: "starter" | "pro" | "business" }
// Creates a Stripe Checkout session and returns its URL. Env-gated: without
// STRIPE_SECRET_KEY (or the plan's price id) this returns 501 so the UI can
// show "Billing launches soon".
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`billing-checkout:${user.id}`, 10, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as { plan?: string } | null;
    const plan = body?.plan;
    if (!plan || !(PAID_PLANS as readonly string[]).includes(plan)) {
      return NextResponse.json(
        { error: "plan must be starter, pro, or business" },
        { status: 400 },
      );
    }

    if (!stripeConfigured()) {
      return NextResponse.json({ error: "Billing is not configured yet." }, { status: 501 });
    }

    const priceId = priceIdFor(plan as PaidPlanName);
    if (!priceId) {
      return NextResponse.json(
        { error: `Billing is not configured for the ${plan} plan yet.` },
        { status: 501 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
    const result = await createCheckoutSession({
      priceId,
      userId: user.id,
      plan,
      successUrl: `${appUrl}/dashboard?upgraded=1`,
      cancelUrl: `${appUrl}/dashboard?checkout=cancelled`,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ url: result.url });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/billing/checkout", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
