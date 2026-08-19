import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from "@/lib/http";
import {
  createRefund,
  isStripeChargeId,
  isStripePaymentIntentId,
} from "@/lib/stripe";

function jsonRes(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("Stripe refund ids", () => {
  it("accepts charge and payment-intent ids only", () => {
    expect(isStripeChargeId("ch_abc123")).toBe(true);
    expect(isStripeChargeId("py_abc123")).toBe(true);
    expect(isStripeChargeId("ch_abc/../customers/cus_x")).toBe(false);
    expect(isStripePaymentIntentId("pi_abc123")).toBe(true);
    expect(isStripePaymentIntentId("pi_abc/extra")).toBe(false);
  });
});

describe("createRefund customer bind", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("refuses a charge owned by another customer", async () => {
    (fetchWithTimeout as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonRes({ customer: "cus_other" }),
    );
    const result = await createRefund({
      chargeId: "ch_abc123",
      customerId: "cus_target",
    });
    expect(result).toMatchObject({ status: 403 });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it("refunds when the charge belongs to the target customer", async () => {
    (fetchWithTimeout as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonRes({ customer: "cus_target" }))
      .mockResolvedValueOnce(jsonRes({ id: "re_1", status: "succeeded" }));
    const result = await createRefund({
      chargeId: "ch_abc123",
      customerId: "cus_target",
    });
    expect(result).toEqual({ refundId: "re_1", status: "succeeded" });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("rejects a path-like charge id before calling Stripe", async () => {
    const result = await createRefund({
      chargeId: "ch_abc/../customers/cus_x",
      customerId: "cus_target",
    });
    expect(result).toMatchObject({ status: 400 });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});
