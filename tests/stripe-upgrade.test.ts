import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOtherCustomerSubscriptions,
  createCheckoutSession,
  planForPriceId,
  siblingSubscriptionIds,
} from "@/lib/stripe";

describe("siblingSubscriptionIds", () => {
  it("drops the subscription that just replaced the others", () => {
    expect(siblingSubscriptionIds(["sub_old", "sub_new"], "sub_new")).toEqual(["sub_old"]);
  });

  it("cancels nothing when checkout omitted the new subscription id", () => {
    expect(siblingSubscriptionIds(["sub_old"], undefined)).toEqual([]);
    expect(siblingSubscriptionIds(["sub_old"], "")).toEqual([]);
  });

  it("dedupes and ignores empty ids", () => {
    expect(siblingSubscriptionIds(["sub_old", "sub_old", ""], "sub_new")).toEqual(["sub_old"]);
  });
});

describe("planForPriceId", () => {
  const keys = [
    "STRIPE_PRICE_STARTER",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_BUSINESS",
    "STRIPE_PRICE_TEAM",
  ] as const;
  const prior: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of keys) {
      prior[key] = process.env[key];
    }
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_BUSINESS = "price_business";
    process.env.STRIPE_PRICE_TEAM = "price_team";
  });

  afterEach(() => {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  });

  it("maps every paid plan including team", () => {
    expect(planForPriceId("price_starter")).toBe("starter");
    expect(planForPriceId("price_pro")).toBe("pro");
    expect(planForPriceId("price_business")).toBe("business");
    expect(planForPriceId("price_team")).toBe("team");
  });

  it("returns undefined for an unknown or missing price", () => {
    expect(planForPriceId("price_other")).toBeUndefined();
    expect(planForPriceId(undefined)).toBeUndefined();
  });
});

describe("createCheckoutSession customer reuse", () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  });

  it("attaches an existing personal customer so upgrades do not mint a second one", async () => {
    await createCheckoutSession({
      priceId: "price_pro",
      userId: "user_1",
      plan: "pro",
      successUrl: "https://app.example/ok",
      cancelUrl: "https://app.example/no",
      customerId: "cus_existing",
    });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(body).toContain("customer=cus_existing");
  });

  it("omits customer on a first purchase", async () => {
    await createCheckoutSession({
      priceId: "price_starter",
      userId: "user_1",
      plan: "starter",
      successUrl: "https://app.example/ok",
      cancelUrl: "https://app.example/no",
    });
    const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body ?? "");
    expect(body).not.toContain("customer=");
  });
});

describe("cancelOtherCustomerSubscriptions", () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  });

  it("cancels the previous active subscription and keeps the new one", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/subscriptions?") && (!init?.method || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "sub_old", status: "active" },
              { id: "sub_new", status: "active" },
              { id: "sub_canceled", status: "canceled" },
            ],
          }),
          text: async () => "",
        };
      }
      if (url.includes("/subscriptions/sub_old") && init?.method === "DELETE") {
        return { ok: true, json: async () => ({ id: "sub_old" }), text: async () => "" };
      }
      throw new Error(`unexpected fetch ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const canceled = await cancelOtherCustomerSubscriptions("cus_1", "sub_new");
    expect(canceled).toEqual(["sub_old"]);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/subscriptions/sub_old"))).toBe(
      true,
    );
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/subscriptions/sub_new"))).toBe(
      false,
    );
  });
});

describe("workspace billing isolation", () => {
  it("does not attach a workspace Stripe customer to Checkout", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/billing/checkout/route.ts"),
      "utf8",
    );
    expect(route).toContain('user.accountType !== "workspace"');
    expect(route).toContain("customerId");
  });

  it("does not cancel sibling subscriptions on a workspace customer", () => {
    const webhook = readFileSync(
      resolve(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf8",
    );
    expect(webhook).toContain("cancelOtherCustomerSubscriptions");
    expect(webhook).toContain('account.accountType !== "workspace"');
  });
});
