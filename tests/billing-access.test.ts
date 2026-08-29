import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { checkoutAllowed, stripePlanAppliesToAccount } from "@/lib/billing-access";

describe("checkoutAllowed", () => {
  it("lets a personal account buy starter/pro/business", () => {
    for (const plan of ["starter", "pro", "business"]) {
      expect(checkoutAllowed({ accountType: "user", workspaceRole: null, plan })).toEqual({
        ok: true,
      });
    }
  });

  it("refuses a personal account buying the team plan", () => {
    const d = checkoutAllowed({ accountType: "user", workspaceRole: null, plan: "team" });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(400);
  });

  it("lets a workspace admin buy the team plan", () => {
    expect(
      checkoutAllowed({ accountType: "workspace", workspaceRole: "admin", plan: "team" }),
    ).toEqual({ ok: true });
  });

  it("refuses a workspace member buying any plan, including team", () => {
    for (const plan of ["starter", "pro", "business", "team"]) {
      const d = checkoutAllowed({
        accountType: "workspace",
        workspaceRole: "member",
        plan,
      });
      expect(d.ok, plan).toBe(false);
      if (!d.ok) expect(d.status).toBe(403);
    }
  });

  it("refuses a workspace admin buying a personal-tier plan (would hijack stripeCustomerId)", () => {
    for (const plan of ["starter", "pro", "business"]) {
      const d = checkoutAllowed({
        accountType: "workspace",
        workspaceRole: "admin",
        plan,
      });
      expect(d.ok, plan).toBe(false);
      if (!d.ok) expect(d.status).toBe(400);
    }
  });
});

describe("stripePlanAppliesToAccount", () => {
  it("applies team only to workspace accounts", () => {
    expect(stripePlanAppliesToAccount("workspace", "team")).toBe(true);
    expect(stripePlanAppliesToAccount("workspace", "starter")).toBe(false);
    expect(stripePlanAppliesToAccount("workspace", "pro")).toBe(false);
    expect(stripePlanAppliesToAccount("workspace", "business")).toBe(false);
  });

  it("applies personal plans only to personal accounts", () => {
    expect(stripePlanAppliesToAccount("user", "starter")).toBe(true);
    expect(stripePlanAppliesToAccount("user", "pro")).toBe(true);
    expect(stripePlanAppliesToAccount("user", "team")).toBe(false);
  });
});

describe("checkout route and webhook use the shared policy", () => {
  it("the checkout route gates via checkoutAllowed, not an incomplete plan===team check", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/billing/checkout/route.ts"),
      "utf8",
    );
    expect(route).toContain("checkoutAllowed");
    expect(route).toContain("workspaceRole: ctx.workspaceRole");
    // The old hole: admin-only ran solely when plan === "team", so a member
    // could POST starter/pro/business against the workspace account.
    expect(route).not.toMatch(/if \(plan === "team"\)/);
  });

  it("the Stripe webhook refuses a mismatched plan before writing plan/customer id", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf8",
    );
    expect(route).toContain("stripePlanAppliesToAccount");
    const completed = route.slice(route.indexOf("if (type === \"checkout.session.completed\")"));
    const nextEvent = completed.indexOf("if (type === \"invoice.paid\")");
    const block = nextEvent === -1 ? completed : completed.slice(0, nextEvent);
    expect(block).toContain("stripePlanAppliesToAccount");
    expect(block.indexOf("stripePlanAppliesToAccount")).toBeLessThan(
      block.indexOf('stripeCustomerId: customerId'),
    );
  });
});
