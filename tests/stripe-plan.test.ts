// Stripe price ↔ plan mapping is how a webhook applies an upgrade. A missed
// reverse lookup silently ignores the switch (planForPriceId → undefined →
// return). These tests pin the bidirectional map, including team.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createCheckoutSession, planForPriceId, priceIdFor, stripeConfigured } from "@/lib/stripe";
import type { PaidPlanName } from "@/lib/credits";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const PLANS: PaidPlanName[] = ["starter", "pro", "business", "team"];

describe("priceIdFor / planForPriceId", () => {
  it("round-trips every paid plan whose Stripe price env is set", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_business");
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_team");

    for (const plan of PLANS) {
      const priceId = priceIdFor(plan);
      expect(priceId, plan).toBe(`price_${plan}`);
      expect(planForPriceId(priceId), plan).toBe(plan);
    }
  });

  it("returns undefined for a missing env, an unknown price, or an empty id", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter");
    vi.stubEnv("STRIPE_PRICE_PRO", undefined);
    expect(priceIdFor("pro")).toBeUndefined();
    expect(planForPriceId("price_someone_else")).toBeUndefined();
    expect(planForPriceId(undefined)).toBeUndefined();
    expect(planForPriceId("")).toBeUndefined();
  });
});

describe("createCheckoutSession", () => {
  it("returns 501 without fetching when Stripe is not configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(stripeConfigured()).toBe(false);
    await expect(
      createCheckoutSession({
        priceId: "price_pro",
        userId: "u1",
        plan: "pro",
        successUrl: "https://app.example/ok",
        cancelUrl: "https://app.example/no",
      }),
    ).resolves.toEqual({ error: "Billing is not configured yet.", status: 501 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 when Stripe omits a checkout URL", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ id: "cs_1" }),
          text: async () => "{}",
        }) as Response,
      ),
    );
    await expect(
      createCheckoutSession({
        priceId: "price_pro",
        userId: "u1",
        plan: "pro",
        successUrl: "https://app.example/ok",
        cancelUrl: "https://app.example/no",
      }),
    ).resolves.toEqual({ error: "Couldn't start checkout. Please try again.", status: 502 });
  });

  it("returns the hosted checkout URL on success", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchSpy = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
        text: async () => "{}",
      }) as Response,
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      createCheckoutSession({
        priceId: "price_pro",
        userId: "u1",
        plan: "pro",
        successUrl: "https://app.example/ok",
        cancelUrl: "https://app.example/no",
      }),
    ).resolves.toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test" });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://api.stripe.com/v1/checkout/sessions");
  });
});
