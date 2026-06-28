// x402 agent-native payments. A connected agent can pay in USDC over HTTP to
// top up usage credits or buy a plan, using the x402 protocol: the first call
// gets HTTP 402 with payment requirements, the agent's x402 client signs a USDC
// authorization and retries with an X-PAYMENT header, and we verify + settle
// through a facilitator before granting anything.
//
// Env-gated exactly like Stripe: without X402_PAY_TO this is "not configured"
// and callers return 501. Pricing stays in lockstep with the credit meter
// (1 credit = $0.01), so paying as you go costs the same as a plan's credits.
//
// Mainnet ("base") settles real USDC through the Coinbase CDP facilitator and
// needs CDP_API_KEY_ID + CDP_API_KEY_SECRET. A testnet ("base-sepolia") uses
// the public facilitator and test USDC, so nothing moves real money until the
// founder sets X402_NETWORK=base and the CDP keys.

// Imported under a non-"use" alias: useFacilitator is an x402 factory, not a
// React hook, and the react-hooks lint rule keys off the name prefix.
import { useFacilitator as createFacilitatorClient } from "x402/verify";
import {
  PaymentPayloadSchema,
  settleResponseHeader,
  type FacilitatorConfig,
  type Network,
  type PaymentPayload,
  type PaymentRequirements,
  type Resource,
} from "x402/types";
import { processPriceToAtomicAmount, safeBase64Decode } from "x402/shared";

// 1 credit = $0.01. Keep this in lockstep with src/lib/credits.ts.
export const USD_PER_CREDIT = 0.01;

// The x402 protocol version this server speaks (x402 v1.x payloads).
const X402_VERSION = 1;

export function x402Network(): Network {
  return (process.env.X402_NETWORK as Network) || "base";
}

export function isMainnet(): boolean {
  return x402Network() === "base";
}

function payTo(): string | undefined {
  return process.env.X402_PAY_TO?.trim() || undefined;
}

/**
 * True when x402 is ready to take payments. Mainnet additionally needs the CDP
 * facilitator credentials, since real USDC can only be settled through it.
 */
export function isX402Configured(): boolean {
  if (!payTo()) return false;
  if (isMainnet()) {
    return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
  }
  return true;
}

// A one-line pointer surfaced on out-of-credits errors so a connected agent
// knows it can pay its own way instead of stalling. Null when x402 is off.
export function topUpHint(): string | null {
  if (!isX402Configured()) return null;
  return "You can pay to continue: POST /api/x402/topup with an x402 payment client (USDC over HTTP 402).";
}

// Build the facilitator config. Testnet uses the public facilitator (undefined
// config); mainnet uses the Coinbase CDP facilitator, loaded lazily so the CDP
// SDK is only pulled in when real settlement is actually configured.
async function facilitatorConfig(): Promise<FacilitatorConfig | undefined> {
  if (!isMainnet()) return undefined;
  const { createFacilitatorConfig } = await import("@coinbase/x402");
  return createFacilitatorConfig(
    process.env.CDP_API_KEY_ID,
    process.env.CDP_API_KEY_SECRET,
  );
}

/**
 * Build the payment requirements for a fixed-price action. `priceUsd` is a
 * plain dollar amount (e.g. 10 for ten dollars); it is converted to the atomic
 * USDC amount and asset for the configured network.
 */
export function buildRequirements(opts: {
  priceUsd: number;
  resource: string;
  description: string;
}): PaymentRequirements {
  const network = x402Network();
  const price = `$${opts.priceUsd.toFixed(2)}`;
  const atomic = processPriceToAtomicAmount(price, network);
  if ("error" in atomic) {
    throw new Error(`x402 price error: ${atomic.error}`);
  }
  const asset = atomic.asset as {
    address: string;
    eip712?: { name: string; version: string };
  };
  return {
    scheme: "exact",
    network,
    maxAmountRequired: atomic.maxAmountRequired,
    resource: opts.resource as Resource,
    description: opts.description,
    mimeType: "application/json",
    payTo: payTo()!,
    maxTimeoutSeconds: 300,
    asset: asset.address,
    extra: asset.eip712,
  };
}

/** The 402 challenge body an x402 client reads to construct its payment. */
export function paymentRequiredBody(
  requirements: PaymentRequirements,
  error = "Payment required. Retry with an X-PAYMENT header.",
) {
  return { x402Version: X402_VERSION, error, accepts: [requirements] };
}

/** Decode and validate the X-PAYMENT header, or null if absent/malformed. */
export function readPayment(req: Request): PaymentPayload | null {
  const header = req.headers.get("X-PAYMENT");
  return header ? decodePaymentHeader(header) : null;
}

/** Decode a raw base64 X-PAYMENT string (e.g. passed as an MCP tool param) into
 *  a payment payload, or null if absent/malformed. */
export function decodePaymentHeader(header: string): PaymentPayload | null {
  if (!header) return null;
  try {
    return PaymentPayloadSchema.parse(JSON.parse(safeBase64Decode(header)));
  } catch {
    return null;
  }
}

/** Canonical resource URL for an x402-priced action, kept identical to the HTTP
 *  routes so a payment signed against an MCP quote and one signed against the
 *  HTTP endpoint are interchangeable: the same on-chain nonce settles either
 *  way, so a cross-transport replay is caught by alreadyCredited. */
export function resourceUrl(path: string): string {
  const base =
    process.env.X402_RESOURCE_BASE?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://tryscalar.xyz";
  return base + path;
}

/**
 * A stable idempotency key for a payment. The exact-evm authorization nonce is
 * single-use on-chain, so it uniquely identifies one settlement and lets us
 * recognise a benign client retry without crediting twice. Returns null when the
 * nonce is absent (malformed payload) so callers can reject early rather than
 * colliding on a shared "unknown" key.
 */
export function paymentRef(payload: PaymentPayload): string | null {
  const inner = (payload as { payload?: { authorization?: { nonce?: string } } })
    .payload;
  const nonce = inner?.authorization?.nonce;
  if (!nonce) return null;
  return `x402:${nonce}`;
}

/** Off-chain validity check through the facilitator (cheap, no settlement). */
export async function verifyPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { verify } = createFacilitatorClient(await facilitatorConfig());
  const res = await verify(payload, requirements);
  return res.isValid ? { ok: true } : { ok: false, reason: res.invalidReason ?? "invalid_payment" };
}

/** Settle on-chain. Only one settlement of a given nonce can ever succeed. */
export async function settlePayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<
  | { ok: true; transaction: string; responseHeader: string }
  | { ok: false; reason: string }
> {
  const { settle } = createFacilitatorClient(await facilitatorConfig());
  const res = await settle(payload, requirements);
  if (!res.success) return { ok: false, reason: res.errorReason ?? "settle_failed" };
  return {
    ok: true,
    transaction: res.transaction,
    responseHeader: settleResponseHeader(res),
  };
}
