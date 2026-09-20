// POST /api/billing/checkout is the card-billing front door. A workspace
// member buying the team plan, a personal account buying team, or an
// unknown plan string must never reach Stripe. These are the guards that
// already exist on main (the team-plan branch). They do not pin the still
// unmerged member-cannot-buy-starter hole.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContext(...args),
}));

const checkRateLimit = vi.fn(async () => ({ success: true, remaining: 9, resetAt: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const stripeConfigured = vi.fn(() => false);
const priceIdFor = vi.fn(() => undefined);
const createCheckoutSession = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: (...args: unknown[]) => stripeConfigured(...args),
  priceIdFor: (...args: unknown[]) => priceIdFor(...args),
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
}));

import { POST } from "@/app/api/billing/checkout/route";

function req(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/billing/checkout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PERSONAL = {
  account: { id: "user-1", accountType: "user" },
  actor: { id: "user-1" },
  workspaceRole: null as string | null,
};

const WORKSPACE_MEMBER = {
  account: { id: "ws-1", accountType: "workspace" },
  actor: { id: "user-2" },
  workspaceRole: "member",
};

const WORKSPACE_ADMIN = {
  account: { id: "ws-1", accountType: "workspace" },
  actor: { id: "user-3" },
  workspaceRole: "admin",
};

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: 0 });
    stripeConfigured.mockReturnValue(false);
    priceIdFor.mockReturnValue(undefined);
    getAuthContext.mockResolvedValue(PERSONAL);
  });

  it("rejects an unknown or missing plan before talking to Stripe", async () => {
    const missing = await POST(req({}));
    const unknown = await POST(req({ plan: "enterprise-galaxy" }));
    const free = await POST(req({ plan: "free" }));

    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(free.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(stripeConfigured).not.toHaveBeenCalled();
  });

  it("refuses the team plan from a personal account", async () => {
    getAuthContext.mockResolvedValue(PERSONAL);
    const res = await POST(req({ plan: "team" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/team workspace/i);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses the team plan when the actor is only a workspace member", async () => {
    getAuthContext.mockResolvedValue(WORKSPACE_MEMBER);
    const res = await POST(req({ plan: "team" }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/admin/i);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not start Stripe checkout when billing is unconfigured", async () => {
    getAuthContext.mockResolvedValue(PERSONAL);
    stripeConfigured.mockReturnValue(false);
    const res = await POST(req({ plan: "pro" }));
    expect(res.status).toBe(501);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not start Stripe checkout when the plan has no price id", async () => {
    getAuthContext.mockResolvedValue(PERSONAL);
    stripeConfigured.mockReturnValue(true);
    priceIdFor.mockReturnValue(undefined);
    const res = await POST(req({ plan: "pro" }));
    expect(res.status).toBe(501);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("lets a workspace admin buy team once Stripe is configured", async () => {
    getAuthContext.mockResolvedValue(WORKSPACE_ADMIN);
    stripeConfigured.mockReturnValue(true);
    priceIdFor.mockReturnValue("price_team");
    createCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test" });

    const res = await POST(req({ plan: "team" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toContain("checkout.stripe.com");
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: "price_team",
        userId: "ws-1",
        plan: "team",
      }),
    );
  });

  it("surfaces a 401 thrown by getAuthContext", async () => {
    getAuthContext.mockRejectedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await POST(req({ plan: "pro" }));
    expect(res.status).toBe(401);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
