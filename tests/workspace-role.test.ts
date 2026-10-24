// Workspace role mapping is the RBAC hinge for admin-only paths (API keys,
// billing, integration secrets). A Clerk "org:member" (or anything else) must
// never become "admin".

import { describe, it, expect } from "vitest";
import { roleFromClerk } from "@/lib/workspace";

describe("roleFromClerk", () => {
  it("maps only org:admin and admin to admin", () => {
    expect(roleFromClerk("org:admin")).toBe("admin");
    expect(roleFromClerk("admin")).toBe("admin");
  });

  it("maps members, unknown roles, and missing values to member", () => {
    expect(roleFromClerk("org:member")).toBe("member");
    expect(roleFromClerk("member")).toBe("member");
    expect(roleFromClerk("org:billing")).toBe("member");
    expect(roleFromClerk("ORG:ADMIN")).toBe("member");
    expect(roleFromClerk(null)).toBe("member");
    expect(roleFromClerk(undefined)).toBe("member");
    expect(roleFromClerk("")).toBe("member");
  });
});
