import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// HTTP quotes must use the canonical resource URL, not req.url.origin.
// A Host header or preview origin would otherwise mint a payment that
// cannot settle against an MCP quote (and vice versa).

const files = [
  "src/app/api/x402/pay/route.ts",
  "src/app/api/x402/topup/route.ts",
  "src/app/api/x402/subscribe/route.ts",
];

describe("x402 plan purchase shares the grant helper", () => {
  it("HTTP subscribe and MCP buy_plan both call settleAndApplyPlan", () => {
    const http = readFileSync(resolve(process.cwd(), "src/app/api/x402/subscribe/route.ts"), "utf8");
    const mcp = readFileSync(resolve(process.cwd(), "src/app/api/mcp/[transport]/route.ts"), "utf8");
    expect(http).toContain("settleAndApplyPlan");
    expect(mcp).toContain("settleAndApplyPlan");
    expect(http).not.toContain("settlePayment(");
    expect(mcp).not.toMatch(/await settlePayment\(/);
  });
});

describe("x402 HTTP resource URLs", () => {
  for (const file of files) {
    it(`${file} quotes against resourceUrl()`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).toContain("resourceUrl(");
      expect(src).not.toMatch(/new URL\(req\.url\)\.origin/);
    });
  }
});
