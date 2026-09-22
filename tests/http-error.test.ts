import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outOfCreditsError } from "@/lib/credits";
import { OpError } from "@/lib/op-error";
import { insufficientCreditsPayload, jsonFromOpError } from "@/lib/http-error";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.X402_PAY_TO;
  delete process.env.X402_NETWORK;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("insufficientCreditsPayload", () => {
  it("names the sku so an HTTP agent can pay for that call", () => {
    const body = insufficientCreditsPayload(outOfCreditsError("email"));
    expect(body.code).toBe("insufficient_credits");
    expect(body.sku).toBe("email");
    expect(body.need).toBe(8);
    expect(body.pay).toBeNull();
  });

  it("points at /api/x402/pay when agent payments are on", () => {
    process.env.X402_PAY_TO = "0x0000000000000000000000000000000000000001";
    process.env.X402_NETWORK = "base-sepolia";
    const paid = insufficientCreditsPayload(outOfCreditsError("linkedin", 2));
    expect(paid.pay?.endpoint).toContain("/api/x402/pay");
    expect(paid.pay?.suggested).toEqual({ sku: "linkedin", quantity: 2 });
  });
});

describe("jsonFromOpError", () => {
  it("keeps a non-402 as a plain error", async () => {
    const res = jsonFromOpError(new OpError("Segment not found", 404));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Segment not found" });
  });

  it("returns a 402 with the pay contract", async () => {
    process.env.X402_PAY_TO = "0x0000000000000000000000000000000000000001";
    process.env.X402_NETWORK = "base-sepolia";
    const res = jsonFromOpError(outOfCreditsError("phone"));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.sku).toBe("phone");
    expect(body.pay.suggested.sku).toBe("phone");
  });
});
