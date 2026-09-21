import { describe, it, expect } from "vitest";
import { computeHealthScore, shouldAutoPause } from "@/lib/mailbox-health";

describe("mailbox health", () => {
  it("starts clean and drops on repeated failures", () => {
    expect(computeHealthScore({ consecutiveFailures: 0 })).toBe(100);
    expect(computeHealthScore({ consecutiveFailures: 3 })).toBe(55);
  });

  it("hard-stops on SPF +all or missing MX", () => {
    expect(shouldAutoPause({ consecutiveFailures: 0, healthScore: 90, dns: { spfPlusAll: true } })).toBe(
      "spf_plus_all",
    );
    expect(shouldAutoPause({ consecutiveFailures: 0, healthScore: 90, dns: { mxOk: false } })).toBe("mx_missing");
  });

  it("pauses after three SMTP failures", () => {
    expect(shouldAutoPause({ consecutiveFailures: 3, healthScore: 55 })).toBe("smtp_failures");
    expect(shouldAutoPause({ consecutiveFailures: 2, healthScore: 70 })).toBeNull();
  });

  it("pauses on a bounce spike, not a single bounce", () => {
    expect(shouldAutoPause({ consecutiveFailures: 0, healthScore: 90, bounceCount: 1, sendCount: 4 })).toBeNull();
    expect(shouldAutoPause({ consecutiveFailures: 0, healthScore: 90, bounceCount: 5, sendCount: 20 })).toBe(
      "bounce_spike",
    );
  });
});
