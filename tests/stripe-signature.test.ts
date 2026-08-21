import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { planForPriceId, verifyStripeSignature } from "@/lib/stripe";

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

  it("maps a team Price id back to the team plan", () => {
    const prev = {
      starter: process.env.STRIPE_PRICE_STARTER,
      pro: process.env.STRIPE_PRICE_PRO,
      business: process.env.STRIPE_PRICE_BUSINESS,
      team: process.env.STRIPE_PRICE_TEAM,
    };
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_BUSINESS = "price_business";
    process.env.STRIPE_PRICE_TEAM = "price_team";
    try {
      expect(planForPriceId("price_team")).toBe("team");
      expect(planForPriceId("price_pro")).toBe("pro");
      expect(planForPriceId("price_unknown")).toBeUndefined();
    } finally {
      process.env.STRIPE_PRICE_STARTER = prev.starter;
      process.env.STRIPE_PRICE_PRO = prev.pro;
      process.env.STRIPE_PRICE_BUSINESS = prev.business;
      process.env.STRIPE_PRICE_TEAM = prev.team;
    }
  });

  it("accepts when any one of multiple v1 signatures matches (key rotation)", () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
    const header = `t=${ts},v1=deadbeef,v1=${good}`;
    expect(verifyStripeSignature(body, header, SECRET)).toBe(true);
  });
});
