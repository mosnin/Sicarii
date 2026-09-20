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
