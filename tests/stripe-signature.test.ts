import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { planForPriceId, verifyStripeSignature } from "@/lib/stripe";
import { PLAN_USD, type PaidPlanName } from "@/lib/credits";

// The Stripe webhook is a public route; the signature IS the authentication.
// If verifyStripeSignature is wrong, anyone can forge billing events (grant
// themselves plans/credits). These tests pin its correctness.

const SECRET = "whsec_test_secret";

function sign(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("accepts a valid signature", () => {
    expect(verifyStripeSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(verifyStripeSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const header = sign(body);
    expect(verifyStripeSignature(body + "x", header, SECRET)).toBe(false);
  });

  it("rejects a wrong secret (forged signature)", () => {
    const forged = sign(body, "whsec_attacker_secret");
    expect(verifyStripeSignature(body, forged, SECRET)).toBe(false);
  });

  it("rejects an expired timestamp (replay outside tolerance)", () => {
    const old = Math.floor(Date.now() / 1000) - 10_000; // >5min default tolerance
    expect(verifyStripeSignature(body, sign(body, SECRET, old), SECRET)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyStripeSignature(body, "garbage", SECRET)).toBe(false);
    expect(verifyStripeSignature(body, "t=123", SECRET)).toBe(false);
    expect(verifyStripeSignature(body, "v1=abc", SECRET)).toBe(false);
  });

  it("accepts when any one of multiple v1 signatures matches (key rotation)", () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
    const header = `t=${ts},v1=deadbeef,v1=${good}`;
    expect(verifyStripeSignature(body, header, SECRET)).toBe(true);
  });
});

// customer.subscription.updated resolves the new plan ONLY via planForPriceId.
// If team (or any later paid plan) is missing from that map, Stripe starts
// charging the new price while Scalar keeps the old plan and allotment.
describe("planForPriceId", () => {
  const PRICE: Record<PaidPlanName, string> = {
    starter: "price_starter",
    pro: "price_pro",
    business: "price_business",
    team: "price_team",
  };
  const envKeys = (Object.keys(PRICE) as PaidPlanName[]).map(
    (plan) => `STRIPE_PRICE_${plan.toUpperCase()}`,
  );
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) saved[key] = process.env[key];
    for (const plan of Object.keys(PRICE) as PaidPlanName[]) {
      process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] = PRICE[plan];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("maps every paid plan price, including team", () => {
    for (const plan of Object.keys(PLAN_USD) as PaidPlanName[]) {
      expect(planForPriceId(PRICE[plan])).toBe(plan);
    }
  });

  it("returns undefined for an unknown or missing price id", () => {
    expect(planForPriceId("price_unknown")).toBeUndefined();
    expect(planForPriceId(undefined)).toBeUndefined();
  });
});
