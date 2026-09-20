import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { addCredits, alreadyCredited } from "@/lib/credits";
import {
  buildRequirements,
  grantAfterSettle,
  isX402Configured,
  paymentRef,
  paymentRequiredBody,
  readPayment,
  settlePayment,
  USD_PER_CREDIT,
  verifyPayment,
  x402Network,
} from "@/lib/x402";

// Pay-as-you-go credit top-ups over x402. A connected agent (or a person) POSTs
// here; the first call returns HTTP 402 with payment requirements, the agent's
// x402 client pays USDC and retries with an X-PAYMENT header, and we settle and
// top up the meter. Credits are priced at par with plan credits ($0.01 each).

const MIN_CREDITS = 100; // $1.00
const MAX_CREDITS = 100_000; // $1,000.00
const DEFAULT_CREDITS = 1_000; // $10.00

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
    limits: { minCredits: MIN_CREDITS, maxCredits: MAX_CREDITS },
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
    const requested = Math.floor(Number(body.credits ?? DEFAULT_CREDITS));
    if (!Number.isFinite(requested) || requested < MIN_CREDITS || requested > MAX_CREDITS) {
      return NextResponse.json(
        { error: `credits must be between ${MIN_CREDITS} and ${MAX_CREDITS}` },
        { status: 400 },
      );
    }

    const priceUsd = Math.round(requested * USD_PER_CREDIT * 100) / 100;
    const resource = new URL(req.url).origin + "/api/x402/topup";
    const requirements = buildRequirements({
      priceUsd,
      resource,
      description: `Top up ${requested} Scalar credits`,
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

    // Idempotency: if this payment already credited, return success without
    // settling again (a benign client retry, never a second charge). Reject
    // payloads with no nonce - they can't be idempotency-keyed safely.
    const ref = paymentRef(payload);
    if (!ref) {
      return NextResponse.json(
        paymentRequiredBody(requirements, "Payment payload missing nonce."),
        { status: 402 },
      );
    }
    const prior = await alreadyCredited(user.id, ref);
    if (prior !== null) {
      return NextResponse.json({ credited: 0, balance: prior, duplicate: true });
    }

    const settled = await settlePayment(payload, requirements);
    if (!settled.ok) {
      return NextResponse.json(
        paymentRequiredBody(requirements, `Settlement failed: ${settled.reason}`),
        { status: 402 },
      );
    }

    // Grant with retry + reconciliation logging: the USDC settled on-chain, so
    // a failed credit must never be silently lost (see grantAfterSettle).
    const balance = await grantAfterSettle(
      () => addCredits(user.id, requested, { action: "topup_x402", ref }),
      { transaction: settled.transaction, userId: user.id, ref, amount: String(requested) },
    );
    return NextResponse.json(
      {
        credited: requested,
        balance,
        network: x402Network(),
        transaction: settled.transaction,
      },
      { headers: { "X-PAYMENT-RESPONSE": settled.responseHeader } },
    );
  } catch (e) {
    console.error("POST /api/x402/topup", e);
    return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
  }
}
