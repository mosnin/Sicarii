import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { getBilling, planFor } from "@/lib/credits";
import { OpError } from "@/lib/op-error";
import { settleAndCredit } from "@/lib/x402-grant";
import {
  listUsageSkus,
  resolveSku,
  usageModelCopy,
} from "@/lib/x402-skus";
import {
  buildRequirements,
  isX402Configured,
  paymentRequiredBody,
  readPayment,
  resourceUrl,
  USD_PER_CREDIT,
  x402Network,
} from "@/lib/x402";

// Pay for one call or one contact over x402. Subscription included credits
// spend first (the same meter). This endpoint is the on-demand overlay:
// no plan required, quantity defaults to 1, priced at $0.01 per credit.

export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const billing = await getBilling(user.id);
  return NextResponse.json({
    protocol: "x402",
    configured: isX402Configured(),
    network: x402Network(),
    unitUsdPerCredit: USD_PER_CREDIT,
    model: usageModelCopy(),
    included: {
      plan: billing.plan,
      allotment: planFor(billing.plan).credits,
      creditsRemaining: billing.creditsRemaining,
      creditsResetAt: billing.creditsResetAt,
    },
    skus: listUsageSkus().map((sku) => ({
      ...sku,
      usd: Math.round(sku.credits * USD_PER_CREDIT * 100) / 100,
    })),
    usage:
      "POST here with an x402 payment client and { sku, quantity? }. sku is a contact bundle (contact, contact_full) or a metered action (email, linkedin, phone, ...). The first call returns 402 with payment requirements; pay and retry to add those credits, then retry the original tool.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await resolveRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rate = await checkRateLimit(`x402-pay:${user.id}`, 40, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isX402Configured()) {
      return NextResponse.json(
        { error: "Agent payments are not configured yet." },
        { status: 501 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      sku?: string;
      quantity?: number;
    };
    if (!body.sku || typeof body.sku !== "string") {
      return NextResponse.json({ error: "sku is required" }, { status: 400 });
    }

    const resolved = resolveSku(body.sku, body.quantity ?? 1);
    const resource = resourceUrl("/api/x402/pay");
    const requirements = buildRequirements({
      priceUsd: resolved.priceUsd,
      resource,
      description: `${resolved.quantity}x ${resolved.sku.label}`,
    });

    const payload = readPayment(req);
    if (!payload) {
      return NextResponse.json(paymentRequiredBody(requirements), { status: 402 });
    }

    const granted = await settleAndCredit({
      userId: user.id,
      credits: resolved.credits,
      payload,
      requirements,
      ledgerAction: `pay_${resolved.sku.id}`,
    });
    if (!granted.ok) {
      return NextResponse.json(paymentRequiredBody(requirements, granted.reason), {
        status: 402,
      });
    }

    return NextResponse.json(
      {
        sku: resolved.sku.id,
        quantity: resolved.quantity,
        credited: granted.credited,
        balance: granted.balance,
        duplicate: granted.duplicate,
        network: x402Network(),
        transaction: granted.transaction,
      },
      granted.responseHeader
        ? { headers: { "X-PAYMENT-RESPONSE": granted.responseHeader } }
        : undefined,
    );
  } catch (e) {
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/x402/pay", e);
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}
