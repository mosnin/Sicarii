import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listOtherLiveSubscriptionIds,
  shouldDowngradeAfterSubscriptionDeleted,
} from "@/lib/stripe";

describe("shouldDowngradeAfterSubscriptionDeleted", () => {
  it("downgrades when this was the only live subscription on the current customer", () => {
    expect(
      shouldDowngradeAfterSubscriptionDeleted({
        deletedCustomerId: "cus_current",
        currentStripeCustomerId: "cus_current",
        otherLiveSubscriptionIds: [],
      }),
    ).toBe(true);
  });

  it("keeps the paid plan when a replacement subscription is still live", () => {
    expect(
      shouldDowngradeAfterSubscriptionDeleted({
        deletedCustomerId: "cus_current",
        currentStripeCustomerId: "cus_current",
        otherLiveSubscriptionIds: ["sub_new"],
      }),
    ).toBe(false);
  });

  it("keeps the paid plan when the deleted sub is on a stale customer from a second Checkout", () => {
    expect(
      shouldDowngradeAfterSubscriptionDeleted({
        deletedCustomerId: "cus_old",
        currentStripeCustomerId: "cus_new",
        otherLiveSubscriptionIds: [],
      }),
    ).toBe(false);
  });

  it("downgrades a genuine cancel when Stripe customer ids are missing", () => {
    expect(
      shouldDowngradeAfterSubscriptionDeleted({
        otherLiveSubscriptionIds: [],
      }),
    ).toBe(true);
  });
});

describe("listOtherLiveSubscriptionIds", () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  });

  it("returns other live subscriptions and ignores the deleted id plus canceled ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "sub_old", status: "canceled" },
            { id: "sub_new", status: "active" },
            { id: "sub_trial", status: "trialing" },
            { id: "sub_dead", status: "incomplete_expired" },
          ],
        }),
        text: async () => "",
      }),
    );

    const ids = await listOtherLiveSubscriptionIds("cus_1", "sub_old");
    expect(ids).toEqual(["sub_new", "sub_trial"]);

    const fetchMock = vi.mocked(fetch);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("customer=cus_1");
  });

  it("throws when Stripe is unreachable so the webhook can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "stripe down",
      }),
    );

    await expect(listOtherLiveSubscriptionIds("cus_1", "sub_old")).rejects.toThrow(
      /list subscriptions failed/,
    );
  });
});

describe("stripe webhook wiring", () => {
  it("decides subscription.deleted from remaining live subscriptions, not blindly", () => {
    const webhook = readFileSync(
      resolve(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf8",
    );
    expect(webhook).toContain("shouldDowngradeAfterSubscriptionDeleted");
    expect(webhook).toContain("listOtherLiveSubscriptionIds");
    expect(webhook).toContain("stripeCustomerId");
  });
});
