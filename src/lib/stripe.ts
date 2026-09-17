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

const PAID_PLANS: PaidPlanName[] = ["starter", "pro", "business", "team"];

/** Reverse of priceIdFor: map a Stripe Price id back to its paid plan, so a
 *  webhook can tell which plan a subscription switched to. */
export function planForPriceId(priceId: string | undefined): PaidPlanName | undefined {
  if (!priceId) return undefined;
  for (const plan of PAID_PLANS) {
    if (priceIdFor(plan) === priceId) return plan;
  }
  return undefined;
}

/** Active-ish Stripe subscription statuses that still bill or will bill. */
const REPLACEABLE_SUB_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

/**
 * Which of `ids` should be canceled when `keepId` is the subscription that
 * just replaced them. Empty keepId means cancel nothing — never wipe a
 * customer because checkout omitted the new subscription id.
 */
export function siblingSubscriptionIds(ids: string[], keepId: string | undefined): string[] {
  if (!keepId) return [];
  return [...new Set(ids)].filter((id) => id && id !== keepId);
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
  /** Existing Stripe customer to reuse so an upgrade does not mint a second
   *  customer (and leave the previous subscription orphaned and charging). */
  customerId?: string;
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
    ...(opts.customerId ? { customer: opts.customerId } : {}),
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

async function stripeForm(
  method: string,
  path: string,
  params?: Record<string, string>,
): Promise<Response> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return fetchWithTimeout(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(params ? { body: encodeForm(params) } : {}),
  });
}

/**
 * Cancel every replaceable subscription on `customerId` except `keepSubscriptionId`.
 * Used after a new Checkout subscription lands so an upgrade does not leave the
 * previous plan charging. Throws on Stripe errors so the webhook can retry.
 */
export async function cancelOtherCustomerSubscriptions(
  customerId: string,
  keepSubscriptionId: string,
): Promise<string[]> {
  const res = await stripeForm("GET", `/subscriptions?customer=${encodeURIComponent(customerId)}&limit=100`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Stripe list subscriptions failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    data?: Array<{ id?: string; status?: string }>;
  };
  const candidates = (body.data ?? [])
    .filter((s) => s.id && REPLACEABLE_SUB_STATUSES.has(s.status ?? ""))
    .map((s) => s.id as string);
  const toCancel = siblingSubscriptionIds(candidates, keepSubscriptionId);
  for (const id of toCancel) {
    const cancel = await stripeForm("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
    if (!cancel.ok) {
      const detail = await cancel.text().catch(() => "");
      throw new Error(`Stripe cancel ${id} failed (${cancel.status}): ${detail.slice(0, 200)}`);
    }
  }
  return toCancel;
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
