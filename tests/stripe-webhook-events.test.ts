// Stripe webhook side effects. The signature tests live in stripe-signature;
// these pin the mutations: duplicates ack without re-granting, checkout
// without metadata is a no-op, renewals only run on subscription_cycle,
// mid-cycle updates refill only when the plan actually changed, and cancel
// clamps leftover credits to the free allotment.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUniqueEvent = vi.fn();
const createEvent = vi.fn();
const updateManyUser = vi.fn();
const updateUser = vi.fn();
const findFirstUser = vi.fn();
const findUniqueUser = vi.fn();
const refillToAllotment = vi.fn();
const maybeCleanup = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    processedEvent: {
      findUnique: (...args: unknown[]) => findUniqueEvent(...args),
      create: (...args: unknown[]) => createEvent(...args),
    },
    user: {
      updateMany: (...args: unknown[]) => updateManyUser(...args),
      update: (...args: unknown[]) => updateUser(...args),
      findFirst: (...args: unknown[]) => findFirstUser(...args),
      findUnique: (...args: unknown[]) => findUniqueUser(...args),
    },
  },
}));

vi.mock("@/lib/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits")>();
  return { ...actual, refillToAllotment: (...args: unknown[]) => refillToAllotment(...args) };
});

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    verifyStripeSignature: () => true,
    planForPriceId: (id?: string) => (id === "price_pro" ? "pro" : id === "price_team" ? "team" : null),
  };
});

vi.mock("@/lib/maintenance", () => ({
  maybeCleanupIdempotency: (...args: unknown[]) => maybeCleanup(...args),
}));

import { POST } from "@/app/api/webhooks/stripe/route";

function req(event: Record<string, unknown>) {
  return new Request("https://scalar.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=ok" },
    body: JSON.stringify(event),
  });
}

describe("POST /api/webhooks/stripe event application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    findUniqueEvent.mockResolvedValue(null);
    createEvent.mockResolvedValue({});
    updateManyUser.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    refillToAllotment.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("acks a duplicate event id without applying or cleaning up", async () => {
    findUniqueEvent.mockResolvedValue({ id: "evt_dup" });
    const res = await POST(req({ id: "evt_dup", type: "invoice.paid", data: { object: {} } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(refillToAllotment).not.toHaveBeenCalled();
    expect(maybeCleanup).not.toHaveBeenCalled();
  });

  it("checkout.session.completed without userId/plan is a no-op", async () => {
    const res = await POST(
      req({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { metadata: {}, customer: "cus_1" } },
      }),
    );
    expect(res.status).toBe(200);
    expect(updateManyUser).not.toHaveBeenCalled();
    expect(refillToAllotment).not.toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith({ data: { id: "evt_1" } });
    expect(maybeCleanup).toHaveBeenCalledWith("evt_1");
  });

  it("checkout.session.completed upgrades and refills the named user", async () => {
    await POST(
      req({
        id: "evt_2",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { userId: "user-A", plan: "pro" },
            customer: "cus_A",
          },
        },
      }),
    );
    expect(updateManyUser).toHaveBeenCalledWith({
      where: { id: "user-A" },
      data: { plan: "pro", stripeCustomerId: "cus_A" },
    });
    expect(refillToAllotment).toHaveBeenCalledWith("user-A", "pro", "evt_2");
  });

  it("invoice.paid only refills on subscription_cycle", async () => {
    findFirstUser.mockResolvedValue({ id: "user-A", plan: "pro" });

    await POST(
      req({
        id: "evt_create",
        type: "invoice.paid",
        data: { object: { billing_reason: "subscription_create", customer: "cus_A" } },
      }),
    );
    expect(refillToAllotment).not.toHaveBeenCalled();

    await POST(
      req({
        id: "evt_cycle",
        type: "invoice.paid",
        data: { object: { billing_reason: "subscription_cycle", customer: "cus_A" } },
      }),
    );
    expect(refillToAllotment).toHaveBeenCalledWith("user-A", "pro", "evt_cycle");
  });

  it("subscription.updated refills only when the plan actually changed", async () => {
    findUniqueUser.mockResolvedValue({ plan: "pro" });

    await POST(
      req({
        id: "evt_same",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            metadata: { userId: "user-A" },
            items: { data: [{ price: { id: "price_pro" } }] },
          },
        },
      }),
    );
    expect(updateUser).not.toHaveBeenCalled();
    expect(refillToAllotment).not.toHaveBeenCalled();

    findUniqueUser.mockResolvedValue({ plan: "starter" });
    await POST(
      req({
        id: "evt_up",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            metadata: { userId: "user-A" },
            items: { data: [{ price: { id: "price_pro" } }] },
          },
        },
      }),
    );
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-A" },
      data: { plan: "pro" },
    });
    expect(refillToAllotment).toHaveBeenCalledWith("user-A", "pro", "evt_up");
  });

  it("subscription.deleted drops to free and clamps leftover credits", async () => {
    findUniqueUser.mockResolvedValue({ creditsRemaining: 5000 });
    await POST(
      req({
        id: "evt_cancel",
        type: "customer.subscription.deleted",
        data: { object: { metadata: { userId: "user-A" } } },
      }),
    );
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-A" },
      data: { plan: "free", creditsRemaining: 200 },
    });
  });

  it("subscription.deleted leaves a balance already under the free allotment", async () => {
    findUniqueUser.mockResolvedValue({ creditsRemaining: 50 });
    await POST(
      req({
        id: "evt_cancel2",
        type: "customer.subscription.deleted",
        data: { object: { metadata: { userId: "user-A" } } },
      }),
    );
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-A" },
      data: { plan: "free", creditsRemaining: 50 },
    });
  });
});
