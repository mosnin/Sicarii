import { describe, it, expect } from "vitest";
import { PLANS, CREDIT_COSTS, planFor } from "@/lib/credits";

describe("credit constants", () => {
  it("every action has a positive credit cost", () => {
    for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
      expect(cost, action).toBeGreaterThan(0);
      expect(Number.isInteger(cost), action).toBe(true);
    }
  });

  it("every plan has positive credits and a monitor allowance", () => {
    for (const [name, plan] of Object.entries(PLANS)) {
      expect(plan.credits, name).toBeGreaterThan(0);
      expect(plan.monitors, name).toBeGreaterThanOrEqual(0);
    }
  });

  it("free is the leanest paid-feature plan; beta covers existing users", () => {
    expect(PLANS.free.credits).toBeLessThan(PLANS.starter.credits);
    expect(PLANS.free.monitors).toBe(0);
    expect(PLANS.beta.credits).toBeGreaterThanOrEqual(PLANS.pro.credits / 2);
  });
});

describe("planFor", () => {
  it("resolves a known plan", () => {
    expect(planFor("pro")).toBe(PLANS.pro);
    expect(planFor("business")).toBe(PLANS.business);
  });

  it("falls back to free for null, undefined, or unknown plans", () => {
    expect(planFor(null)).toBe(PLANS.free);
    expect(planFor(undefined)).toBe(PLANS.free);
    expect(planFor("enterprise-galaxy")).toBe(PLANS.free);
  });
});
