import { describe, expect, it } from "vitest";
import { CREDIT_COSTS } from "@/lib/credits";
import { USD_PER_CREDIT } from "@/lib/x402";
import {
  CONTACT_SKUS,
  findSku,
  listUsageSkus,
  resolveSku,
} from "@/lib/x402-skus";

describe("usage SKUs", () => {
  it("prices a contact as LinkedIn plus email", () => {
    expect(CONTACT_SKUS.contact.credits).toBe(CREDIT_COSTS.linkedin + CREDIT_COSTS.email);
    expect(CONTACT_SKUS.contact_full.credits).toBe(
      CREDIT_COSTS.linkedin + CREDIT_COSTS.email + CREDIT_COSTS.phone,
    );
  });

  it("lists every metered action plus the contact bundles", () => {
    const ids = listUsageSkus().map((s) => s.id);
    expect(ids).toContain("contact");
    expect(ids).toContain("contact_full");
    for (const action of Object.keys(CREDIT_COSTS)) {
      expect(ids).toContain(action);
    }
  });

  it("resolves a single email call at the credit price", () => {
    const resolved = resolveSku("email");
    expect(resolved.credits).toBe(CREDIT_COSTS.email);
    expect(resolved.priceUsd).toBe(CREDIT_COSTS.email * USD_PER_CREDIT);
    expect(resolved.quantity).toBe(1);
  });

  it("resolves three contacts as a single on-demand purchase", () => {
    const resolved = resolveSku("contact", 3);
    expect(resolved.credits).toBe(CONTACT_SKUS.contact.credits * 3);
    expect(resolved.priceUsd).toBe(
      Math.round(CONTACT_SKUS.contact.credits * 3 * USD_PER_CREDIT * 100) / 100,
    );
  });

  it("rejects an unknown sku and a wild quantity", () => {
    expect(() => resolveSku("not-a-sku")).toThrow(/Unknown usage sku/);
    expect(() => resolveSku("email", 0)).toThrow(/quantity/);
    expect(() => resolveSku("email", 501)).toThrow(/quantity/);
  });

  it("does not invent a sku from a neighboring name", () => {
    expect(findSku("emails")).toBeNull();
    expect(findSku("contact_plus")).toBeNull();
  });

  it("never treats inherited object keys as a payable sku", () => {
    expect(findSku("__proto__")).toBeNull();
    expect(findSku("constructor")).toBeNull();
    expect(findSku("toString")).toBeNull();
    expect(() => resolveSku("__proto__")).toThrow(/Unknown usage sku/);
  });
});
