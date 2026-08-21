import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { settleAndCredit } from "@/lib/x402-grant";
import {
  DEFAULT_PACK_CREDITS,
  MAX_PACK_CREDITS,
  MIN_PACK_CREDITS,
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

// Credit-pack top-ups over x402. For a single call or contact, prefer
// POST /api/x402/pay. Packs start at $1 (100 credits) for extra usage
// after a plan allotment runs dry.

// GET: a no-charge description of the top-up so agents and people can discover
// the price and how to pay, without triggering a payment challenge.
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    protocol: "x402",
    configured: isX402Configured(),
    network: x402Network(),
    unitUsdPerCredit: USD_PER_CREDIT,
    limits: { minCredits: MIN_PACK_CREDITS, maxCredits: MAX_PACK_CREDITS },
    presets: [
      { credits: 1_000, usd: 10 },
      { credits: 5_000, usd: 50 },
      { credits: 20_000, usd: 200 },
    ],
    usage:
      "POST here with an x402 payment client and optional { credits }. The first call returns 402 with payment requirements; pay and retry to top up.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await resolveRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rate = await checkRateLimit(`x402-topup:${user.id}`, 30, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isX402Configured()) {
      return NextResponse.json(
        { error: "Agent payments are not configured yet." },
        { status: 501 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { credits?: number };
    const requested = Math.floor(Number(body.credits ?? DEFAULT_PACK_CREDITS));
    if (!Number.isFinite(requested) || requested < MIN_PACK_CREDITS || requested > MAX_PACK_CREDITS) {
      return NextResponse.json(
        { error: `credits must be between ${MIN_PACK_CREDITS} and ${MAX_PACK_CREDITS}` },
        { status: 400 },
      );
    }

    const priceUsd = Math.round(requested * USD_PER_CREDIT * 100) / 100;
    const resource = resourceUrl("/api/x402/topup");
    const requirements = buildRequirements({
      priceUsd,
      resource,
      description: `Top up ${requested} Scalar credits`,
    });

    const payload = readPayment(req);
    if (!payload) {
      return NextResponse.json(paymentRequiredBody(requirements), { status: 402 });
    }

    const granted = await settleAndCredit({
      userId: user.id,
      credits: requested,
      payload,
      requirements,
      ledgerAction: "topup_x402",
    });
    if (!granted.ok) {
      return NextResponse.json(paymentRequiredBody(requirements, granted.reason), {
        status: 402,
      });
    }

    return NextResponse.json(
      {
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
    console.error("POST /api/x402/topup", e);
    return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
  }
}
