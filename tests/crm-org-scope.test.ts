// Switching Clerk orgs must not paint the previous tenant's contacts.
// The CRM layout holds the RSC tree back until Clerk's client org matches
// the org the server rendered; these tests lock that decision.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crmOrgScopeKey, shouldPaintCrmContacts } from "@/lib/crm-org-scope";

describe("crmOrgScopeKey", () => {
  it("uses the Clerk org id when a team is active", () => {
    expect(crmOrgScopeKey("org_acme")).toBe("org_acme");
  });

  it("collapses empty / missing org to personal", () => {
    expect(crmOrgScopeKey(null)).toBe("personal");
    expect(crmOrgScopeKey(undefined)).toBe("personal");
    expect(crmOrgScopeKey("")).toBe("personal");
    expect(crmOrgScopeKey("   ")).toBe("personal");
  });
});

describe("shouldPaintCrmContacts", () => {
  it("never paints before hydration — that is how a stale /crm RSC would flash names", () => {
    expect(
      shouldPaintCrmContacts({
        hydrated: false,
        clerkLoaded: true,
        clientOrgId: "org_acme",
        renderedOrgId: "org_acme",
      }),
    ).toBe(false);
  });

  it("never paints before Clerk has loaded the active org", () => {
    expect(
      shouldPaintCrmContacts({
        hydrated: true,
        clerkLoaded: false,
        clientOrgId: "org_acme",
        renderedOrgId: "org_acme",
      }),
    ).toBe(false);
  });

  it("paints only when the payload org is the org the browser is in", () => {
    expect(
      shouldPaintCrmContacts({
        hydrated: true,
        clerkLoaded: true,
        clientOrgId: "org_acme",
        renderedOrgId: "org_acme",
      }),
    ).toBe(true);
    expect(
      shouldPaintCrmContacts({
        hydrated: true,
        clerkLoaded: true,
        clientOrgId: null,
        renderedOrgId: null,
      }),
    ).toBe(true);
  });

  it("hides contacts when the cached payload is the previous org", () => {
    expect(
      shouldPaintCrmContacts({
        hydrated: true,
        clerkLoaded: true,
        clientOrgId: "org_beta",
        renderedOrgId: "org_acme",
      }),
    ).toBe(false);
  });

  it("hides contacts when switching from a team to the personal account", () => {
    expect(
      shouldPaintCrmContacts({
        hydrated: true,
        clerkLoaded: true,
        clientOrgId: null,
        renderedOrgId: "org_acme",
      }),
    ).toBe(false);
  });

  it("hides contacts when switching from personal into a team", () => {
    expect(
      shouldPaintCrmContacts({
        hydrated: true,
        clerkLoaded: true,
        clientOrgId: "org_acme",
        renderedOrgId: null,
      }),
    ).toBe(false);
  });
});

describe("CRM layout source guard", () => {
  it("wraps every CRM route in CrmOrgGuard keyed to the rendered Clerk org", () => {
    const src = readFileSync("src/app/(dashboard)/crm/layout.tsx", "utf8");
    expect(src).toContain("CrmOrgGuard");
    expect(src).toContain("renderedOrgId");
    expect(src).toContain("auth()");
  });

  it("does not render children until shouldPaintCrmContacts is true", () => {
    const src = readFileSync("src/components/dashboard/crm-org-guard.tsx", "utf8");
    expect(src).toContain("shouldPaintCrmContacts");
    expect(src).toContain("CrmOrgPending");
    expect(src).toContain("router.refresh()");
  });
});
