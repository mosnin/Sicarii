import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildRequirements,
  isX402Configured,
  paymentRequiredBody,
  paymentRef,
  topUpHint,
  x402Network,
} from "@/lib/x402";
import { PLAN_USD } from "@/lib/credits";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.X402_PAY_TO;
  delete process.env.X402_NETWORK;
  delete process.env.CDP_API_KEY_ID;
  delete process.env.CDP_API_KEY_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("isX402Configured", () => {
  it("is off without a pay-to wallet", () => {
    expect(isX402Configured()).toBe(false);
  });

  it("is on for testnet with just a wallet", () => {
    process.env.X402_PAY_TO = "0xabc";
    process.env.X402_NETWORK = "base-sepolia";
    expect(isX402Configured()).toBe(true);
  });

  it("requires CDP credentials on mainnet", () => {
    process.env.X402_PAY_TO = "0xabc";
    process.env.X402_NETWORK = "base"; // mainnet
    expect(isX402Configured()).toBe(false);
    process.env.CDP_API_KEY_ID = "id";
    process.env.CDP_API_KEY_SECRET = "secret";
    expect(isX402Configured()).toBe(true);
  });

  it("defaults the network to base mainnet", () => {
    expect(x402Network()).toBe("base");
  });
});

describe("topUpHint", () => {
  it("is null when payments are off", () => {
    expect(topUpHint()).toBeNull();
  });

  it("points at the top-up endpoint when configured", () => {
    process.env.X402_PAY_TO = "0xabc";
    process.env.X402_NETWORK = "base-sepolia";
    expect(topUpHint()).toContain("/api/x402/topup");
  });
});

describe("buildRequirements", () => {
  beforeEach(() => {
    process.env.X402_PAY_TO = "0xTreasury";
    process.env.X402_NETWORK = "base-sepolia";
  });

  it("prices a $10 top-up at 10,000,000 atomic USDC (6 decimals)", () => {
    const req = buildRequirements({
      priceUsd: 10,
      resource: "https://app.example/api/x402/topup",
      description: "Top up 1000 Scalar credits",
    });
    expect(req.scheme).toBe("exact");
    expect(req.network).toBe("base-sepolia");
    expect(req.payTo).toBe("0xTreasury");
    expect(req.maxAmountRequired).toBe("10000000");
    expect(req.asset).toMatch(/^0x/);
    expect(req.resource).toBe("https://app.example/api/x402/topup");
    expect(req.maxTimeoutSeconds).toBeGreaterThan(0);
  });
});

describe("paymentRequiredBody", () => {
  it("wraps requirements in an x402 challenge", () => {
    process.env.X402_PAY_TO = "0xTreasury";
    process.env.X402_NETWORK = "base-sepolia";
    const req = buildRequirements({
      priceUsd: 1,
      resource: "https://app.example/api/x402/topup",
      description: "Top up",
    });
    const body = paymentRequiredBody(req);
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toEqual([req]);
    expect(typeof body.error).toBe("string");
  });
});

describe("paymentRef", () => {
  it("derives a stable idempotency key from the authorization nonce", () => {
    const payload = { payload: { authorization: { nonce: "0xdeadbeef" } } } as never;
    expect(paymentRef(payload)).toBe("x402:0xdeadbeef");
  });

  it("returns null on a payload with no nonce so callers reject it", () => {
    // Security: a shared "unknown" ref would make two different malformed
    // payments collide on one idempotency key. Null forces a 400 upstream.
    expect(paymentRef({} as never)).toBeNull();
    expect(paymentRef({ payload: { authorization: {} } } as never)).toBeNull();
  });
});

describe("PLAN_USD", () => {
  it("prices every paid plan as a positive number", () => {
    for (const [plan, usd] of Object.entries(PLAN_USD)) {
      expect(usd, plan).toBeGreaterThan(0);
    }
  });
});
