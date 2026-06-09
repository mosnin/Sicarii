import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchWithTimeout } from "@/lib/http";

const PAID_PLANS = ["starter", "pro", "business"] as const;
type PaidPlan = (typeof PAID_PLANS)[number];

// POST /api/billing/checkout  body: { plan: "starter" | "pro" | "business" }
// Creates a Creem.io checkout session and returns its URL. Env-gated: without
// CREEM_API_KEY this returns 501 so the UI can show "Billing launches soon".
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

    const apiKey = process.env.CREEM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Billing is not configured yet." },
        { status: 501 },
      );
    }

    const productId = process.env[`CREEM_PRODUCT_${plan.toUpperCase()}`];
    if (!productId) {
      return NextResponse.json(
        { error: `Billing is not configured for the ${plan} plan yet.` },
        { status: 501 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tryscalar.xyz";
    const res = await fetchWithTimeout("https://api.creem.io/v1/checkouts", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: productId,
        success_url: `${appUrl}/dashboard?upgraded=1`,
        metadata: { userId: user.id, plan: plan as PaidPlan },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Creem checkout failed", res.status, detail.slice(0, 500));
      return NextResponse.json(
        { error: "Couldn't start checkout. Please try again." },
        { status: 502 },
      );
    }

    const data = (await res.json().catch(() => null)) as {
      checkout_url?: string;
      url?: string;
    } | null;
    const url = data?.checkout_url ?? data?.url;
    if (!url) {
      console.error("Creem checkout returned no URL", data);
      return NextResponse.json(
        { error: "Couldn't start checkout. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/billing/checkout", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
