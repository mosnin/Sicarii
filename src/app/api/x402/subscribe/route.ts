import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { applyPlan, PLAN_USD, PLANS, type PaidPlanName } from "@/lib/credits";
import {
  buildRequirements,
  isX402Configured,
  paymentRef,
  paymentRequiredBody,
  readPayment,
  settlePayment,
  verifyPayment,
  x402Network,
} from "@/lib/x402";

// Buy a plan over x402. A connected agent pays the monthly price in USDC and the
// account is set to that plan with a fresh 30-day window. USDC is not recurring,
// so this is a 30-day pass the agent re-pays; humans paying by card still go
// through Creem (/api/billing/checkout). Same 402 -> pay -> retry dance as the
// top-up route.

const PAID_PLANS = Object.keys(PLAN_USD) as PaidPlanName[];

export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    protocol: "x402",
    configured: isX402Configured(),
    network: x402Network(),
    plans: PAID_PLANS.map((plan) => ({
      plan,
      usd: PLAN_USD[plan],
      credits: PLANS[plan].credits,
      period: "30 days",
    })),
    usage:
      "POST here with an x402 payment client and { plan }. The first call returns 402 with payment requirements; pay and retry to activate the plan.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await resolveRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rate = await checkRateLimit(`x402-subscribe:${user.id}`, 20, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isX402Configured()) {
      return NextResponse.json(
        { error: "Agent payments are not configured yet." },
        { status: 501 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { plan?: string };
    const plan = body.plan as PaidPlanName | undefined;
    if (!plan || !PAID_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: `plan must be one of: ${PAID_PLANS.join(", ")}` },
        { status: 400 },
      );
    }

    const priceUsd = PLAN_USD[plan];
    const resource = new URL(req.url).origin + "/api/x402/subscribe";
    const requirements = buildRequirements({
      priceUsd,
      resource,
      description: `Scalar ${plan} plan, 30 days`,
    });

    const payload = readPayment(req);
    if (!payload) {
      return NextResponse.json(paymentRequiredBody(requirements), { status: 402 });
    }

    const verified = await verifyPayment(payload, requirements);
    if (!verified.ok) {
      return NextResponse.json(
        paymentRequiredBody(requirements, `Payment invalid: ${verified.reason}`),
        { status: 402 },
      );
    }

    const ref = paymentRef(payload);
    const settled = await settlePayment(payload, requirements);
    if (!settled.ok) {
      return NextResponse.json(
        paymentRequiredBody(requirements, `Settlement failed: ${settled.reason}`),
        { status: 402 },
      );
    }

    // applyPlan is idempotent on ref, so a retried settlement never refills twice.
    await applyPlan(user.id, plan, { ref });
    return NextResponse.json(
      {
        plan,
        credits: PLANS[plan].credits,
        period: "30 days",
        network: x402Network(),
        transaction: settled.transaction,
      },
      { headers: { "X-PAYMENT-RESPONSE": settled.responseHeader } },
    );
  } catch (e) {
    console.error("POST /api/x402/subscribe", e);
    return NextResponse.json({ error: "Subscription failed" }, { status: 500 });
  }
}
