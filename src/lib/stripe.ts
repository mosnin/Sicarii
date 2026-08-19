import { createHmac, timingSafeEqual } from "crypto";
import { fetchWithTimeout } from "@/lib/http";
import type { PaidPlanName } from "@/lib/credits";

// Thin Stripe layer over the REST API (no SDK, mirroring the existing
// fetch-based billing code). Covers exactly what Scalar needs: creating a
// hosted Checkout session for a plan subscription, and verifying webhook
// signatures. Env-gated: without STRIPE_SECRET_KEY, callers treat billing as
// not configured and return 501.

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** The recurring Price id for a paid plan, from STRIPE_PRICE_<PLAN>. */
export function priceIdFor(plan: PaidPlanName): string | undefined {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
}

/** Reverse of priceIdFor: map a Stripe Price id back to its paid plan, so a
 *  webhook can tell which plan a subscription switched to. */
export function planForPriceId(priceId: string | undefined): PaidPlanName | undefined {
  if (!priceId) return undefined;
  for (const plan of ["starter", "pro", "business"] as const) {
    if (priceIdFor(plan) === priceId) return plan;
  }
  return undefined;
}

function encodeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

type CheckoutResult = { url: string } | { error: string; status: number };

/**
 * Create a hosted Stripe Checkout session in subscription mode. userId and plan
 * ride along as metadata on both the session and the subscription, so the
 * webhook can apply the plan on checkout.session.completed and resolve the user
 * on later subscription events.
 */
export async function createCheckoutSession(opts: {
  priceId: string;
  userId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "Billing is not configured yet.", status: 501 };

  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    allow_promotion_codes: "true",
    "metadata[userId]": opts.userId,
    "metadata[plan]": opts.plan,
    "subscription_data[metadata][userId]": opts.userId,
    "subscription_data[metadata][plan]": opts.plan,
  };

  const res = await fetchWithTimeout(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(params),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Stripe checkout failed", res.status, detail.slice(0, 500));
    return { error: "Couldn't start checkout. Please try again.", status: 502 };
  }

  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!data?.url) {
    console.error("Stripe checkout returned no URL", data);
    return { error: "Couldn't start checkout. Please try again.", status: 502 };
  }
  return { url: data.url };
}

type StripeCharge = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  refunded: boolean;
  amount_refunded: number;
  description: string | null;
  payment_intent: string | null;
};

/**
 * Recent charges for a Stripe customer. Used by the admin billing desk so
 * support can see what to refund without leaving Scalar.
 */
export async function listCustomerCharges(
  customerId: string,
  limit = 20,
): Promise<{ charges: StripeCharge[] } | { error: string; status: number }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "Billing is not configured yet.", status: 501 };

  const res = await fetchWithTimeout(
    `${STRIPE_API}/charges?${encodeForm({ customer: customerId, limit: String(Math.min(limit, 50)) })}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Stripe list charges failed", res.status, detail.slice(0, 500));
    return { error: "Couldn't load charges.", status: 502 };
  }
  const data = (await res.json().catch(() => null)) as { data?: StripeCharge[] } | null;
  return { charges: data?.data ?? [] };
}

export const STRIPE_CHARGE_ID_RE = /^(ch|py)_[A-Za-z0-9]+$/;
export const STRIPE_PAYMENT_INTENT_ID_RE = /^pi_[A-Za-z0-9]+$/;

export function isStripeChargeId(id: string): boolean {
  return STRIPE_CHARGE_ID_RE.test(id);
}

export function isStripePaymentIntentId(id: string): boolean {
  return STRIPE_PAYMENT_INTENT_ID_RE.test(id);
}

async function stripeGetJson<T>(
  path: string,
  key: string,
): Promise<T | null> {
  const res = await fetchWithTimeout(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/**
 * Resolve the Stripe customer on a charge or payment intent. Used so a refund
 * cannot be aimed at some other customer's payment just because support has
 * a valid-looking ch_/pi_ id.
 */
export async function customerForStripeRef(opts: {
  chargeId?: string;
  paymentIntentId?: string;
  key: string;
}): Promise<{ customer: string | null } | { error: string; status: number }> {
  if (opts.chargeId) {
    if (!isStripeChargeId(opts.chargeId)) {
      return { error: "Invalid charge id", status: 400 };
    }
    const charge = await stripeGetJson<{ customer?: string | null }>(
      `/charges/${encodeURIComponent(opts.chargeId)}`,
      opts.key,
    );
    if (!charge) return { error: "Charge not found", status: 404 };
    return { customer: charge.customer ?? null };
  }
  if (opts.paymentIntentId) {
    if (!isStripePaymentIntentId(opts.paymentIntentId)) {
      return { error: "Invalid payment intent id", status: 400 };
    }
    const pi = await stripeGetJson<{ customer?: string | null }>(
      `/payment_intents/${encodeURIComponent(opts.paymentIntentId)}`,
      opts.key,
    );
    if (!pi) return { error: "Payment intent not found", status: 404 };
    return { customer: pi.customer ?? null };
  }
  return { error: "chargeId or paymentIntentId is required", status: 400 };
}

/**
 * Issue a Stripe refund. amountCents omitted = full refund. Idempotent on
 * Stripe's side when the same charge is already fully refunded (they return
 * the existing refund or an error we surface). When customerId is set, the
 * charge/PI must belong to that customer or we refuse.
 */
export async function createRefund(opts: {
  chargeId?: string;
  paymentIntentId?: string;
  amountCents?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  customerId?: string;
}): Promise<{ refundId: string; status: string } | { error: string; status: number }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "Billing is not configured yet.", status: 501 };
  if (!opts.chargeId && !opts.paymentIntentId) {
    return { error: "chargeId or paymentIntentId is required", status: 400 };
  }
  if (opts.chargeId && !isStripeChargeId(opts.chargeId)) {
    return { error: "Invalid charge id", status: 400 };
  }
  if (opts.paymentIntentId && !isStripePaymentIntentId(opts.paymentIntentId)) {
    return { error: "Invalid payment intent id", status: 400 };
  }

  if (opts.customerId) {
    const owner = await customerForStripeRef({
      chargeId: opts.chargeId,
      paymentIntentId: opts.paymentIntentId,
      key,
    });
    if ("error" in owner) return owner;
    if (!owner.customer || owner.customer !== opts.customerId) {
      return { error: "That charge does not belong to this account.", status: 403 };
    }
  }

  const params: Record<string, string> = {
    reason: opts.reason ?? "requested_by_customer",
  };
  if (opts.chargeId) params.charge = opts.chargeId;
  if (opts.paymentIntentId) params.payment_intent = opts.paymentIntentId;
  if (opts.amountCents && opts.amountCents > 0) params.amount = String(opts.amountCents);

  const res = await fetchWithTimeout(`${STRIPE_API}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(params),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Stripe refund failed", res.status, detail.slice(0, 500));
    return { error: "Couldn't issue the refund. Check the charge in Stripe.", status: 502 };
  }
  const data = (await res.json().catch(() => null)) as { id?: string; status?: string } | null;
  if (!data?.id) return { error: "Stripe returned no refund id.", status: 502 };
  return { refundId: data.id, status: data.status ?? "pending" };
}

/** Hosted Stripe billing portal so support can hand a customer a manage-billing link. */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string } | { error: string; status: number }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "Billing is not configured yet.", status: 501 };

  const res = await fetchWithTimeout(`${STRIPE_API}/billing_portal/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm({ customer: opts.customerId, return_url: opts.returnUrl }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Stripe portal failed", res.status, detail.slice(0, 500));
    return { error: "Couldn't open the billing portal.", status: 502 };
  }
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!data?.url) return { error: "Couldn't open the billing portal.", status: 502 };
  return { url: data.url };
}

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature: t=...,v1=...`
 * header). Reproduces stripe.webhooks.constructEvent: HMAC-SHA256 of
 * `${t}.${rawBody}` with the endpoint secret, compared in constant time, with a
 * 5-minute timestamp tolerance for replay protection.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
): boolean {
  if (!header) return false;

  let t: string | undefined;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || v1.length === 0) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return v1.some((candidate) => {
    const candidateBuf = Buffer.from(candidate);
    return candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);
  });
}
