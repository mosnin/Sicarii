// x402 top-up and subscribe are the agent-paid money paths. A malformed
// payload (no nonce) or a retried settlement must never settle again or
// double-grant. Bounds keep a typo from charging $10k. grantAfterSettle
// itself is covered in tests/grant-after-settle.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const USER = { id: "user-1" };

const resolveRequestUser = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  resolveRequestUser: (...args: unknown[]) => resolveRequestUser(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, remaining: 10, resetAt: 0 })),
}));

const alreadyCredited = vi.fn();
const addCredits = vi.fn();
const applyPlan = vi.fn();
vi.mock("@/lib/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits")>();
  return {
    ...actual,
    alreadyCredited: (...args: unknown[]) => alreadyCredited(...args),
    addCredits: (...args: unknown[]) => addCredits(...args),
    applyPlan: (...args: unknown[]) => applyPlan(...args),
  };
});

const isX402Configured = vi.fn(() => true);
const readPayment = vi.fn();
const verifyPayment = vi.fn();
const paymentRef = vi.fn();
const settlePayment = vi.fn();
const grantAfterSettle = vi.fn(async (grant: () => Promise<unknown>) => grant());
vi.mock("@/lib/x402", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/x402")>();
  return {
    ...actual,
    isX402Configured: () => isX402Configured(),
    readPayment: (...args: unknown[]) => readPayment(...args),
    verifyPayment: (...args: unknown[]) => verifyPayment(...args),
    paymentRef: (...args: unknown[]) => paymentRef(...args),
    settlePayment: (...args: unknown[]) => settlePayment(...args),
    grantAfterSettle: (...args: unknown[]) => grantAfterSettle(...(args as [() => Promise<unknown>])),
  };
});

import { GET as topupGet, POST as topupPost } from "@/app/api/x402/topup/route";
import { POST as subscribePost } from "@/app/api/x402/subscribe/route";

function req(path: string, body: unknown = {}) {
  return new NextRequest(new URL(`https://scalar.test${path}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveRequestUser.mockResolvedValue(USER);
  isX402Configured.mockReturnValue(true);
  readPayment.mockReturnValue({ payload: { authorization: { nonce: "0xabc" } } });
  verifyPayment.mockResolvedValue({ ok: true });
  paymentRef.mockReturnValue("x402:0xabc");
  alreadyCredited.mockResolvedValue(null);
  settlePayment.mockResolvedValue({
    ok: true,
    transaction: "0xtx",
    responseHeader: "resp",
  });
  addCredits.mockResolvedValue(1600);
  applyPlan.mockResolvedValue(undefined);
  grantAfterSettle.mockImplementation(async (grant: () => Promise<unknown>) => grant());
});

describe("POST /api/x402/topup", () => {
  it("is 401 when unsigned", async () => {
    resolveRequestUser.mockResolvedValue(null);
    const res = await topupPost(req("/api/x402/topup", { credits: 1000 }));
    expect(res.status).toBe(401);
    expect(settlePayment).not.toHaveBeenCalled();
  });

  it("rejects credits below the $1 floor and above the $1,000 ceiling", async () => {
    const low = await topupPost(req("/api/x402/topup", { credits: 99 }));
    expect(low.status).toBe(400);
    const high = await topupPost(req("/api/x402/topup", { credits: 100_001 }));
    expect(high.status).toBe(400);
    expect(settlePayment).not.toHaveBeenCalled();
  });

  it("never settles a payload with no nonce (cannot be idempotency-keyed)", async () => {
    paymentRef.mockReturnValue(null);
    const res = await topupPost(req("/api/x402/topup", { credits: 1000 }));
    expect(res.status).toBe(402);
    expect(settlePayment).not.toHaveBeenCalled();
    expect(grantAfterSettle).not.toHaveBeenCalled();
  });

  it("returns the prior balance on a retried payment and never settles again", async () => {
    alreadyCredited.mockResolvedValue(1600);
    const res = await topupPost(req("/api/x402/topup", { credits: 1000 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { duplicate: boolean; balance: number; credited: number };
    expect(body).toEqual({ credited: 0, balance: 1600, duplicate: true });
    expect(settlePayment).not.toHaveBeenCalled();
    expect(grantAfterSettle).not.toHaveBeenCalled();
  });

  it("settles then grants through grantAfterSettle so a post-settle failure is retried", async () => {
    const res = await topupPost(req("/api/x402/topup", { credits: 1000 }));
    expect(res.status).toBe(200);
    expect(settlePayment).toHaveBeenCalledOnce();
    expect(grantAfterSettle).toHaveBeenCalledOnce();
    expect(addCredits).toHaveBeenCalledWith("user-1", 1000, {
      action: "topup_x402",
      ref: "x402:0xabc",
    });
    const body = (await res.json()) as { credited: number; balance: number; transaction: string };
    expect(body.credited).toBe(1000);
    expect(body.balance).toBe(1600);
    expect(body.transaction).toBe("0xtx");
  });
});

describe("GET /api/x402/topup", () => {
  it("describes the price without triggering settlement", async () => {
    const res = await topupGet(
      new NextRequest(new URL("https://scalar.test/api/x402/topup")),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { unitUsdPerCredit: number; limits: { minCredits: number } };
    expect(body.unitUsdPerCredit).toBe(0.01);
    expect(body.limits.minCredits).toBe(100);
    expect(settlePayment).not.toHaveBeenCalled();
  });
});

describe("POST /api/x402/subscribe", () => {
  it("rejects an unknown plan before any payment work", async () => {
    const res = await subscribePost(req("/api/x402/subscribe", { plan: "enterprise-galaxy" }));
    expect(res.status).toBe(400);
    expect(readPayment).not.toHaveBeenCalled();
    expect(settlePayment).not.toHaveBeenCalled();
  });

  it("never settles a payload with no nonce", async () => {
    paymentRef.mockReturnValue(null);
    const res = await subscribePost(req("/api/x402/subscribe", { plan: "pro" }));
    expect(res.status).toBe(402);
    expect(settlePayment).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("skips settle on a retried payment that already applied the plan", async () => {
    alreadyCredited.mockResolvedValue(12000);
    const res = await subscribePost(req("/api/x402/subscribe", { plan: "pro" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: "pro", duplicate: true });
    expect(settlePayment).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("settles then applyPlan through grantAfterSettle", async () => {
    const res = await subscribePost(req("/api/x402/subscribe", { plan: "team" }));
    expect(res.status).toBe(200);
    expect(settlePayment).toHaveBeenCalledOnce();
    expect(applyPlan).toHaveBeenCalledWith("user-1", "team", { ref: "x402:0xabc" });
    const body = (await res.json()) as { plan: string; credits: number };
    expect(body.plan).toBe("team");
    expect(body.credits).toBe(30000);
  });
});
