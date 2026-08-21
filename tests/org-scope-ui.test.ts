// Org-scope UI helpers: the dashboard must never greet or label the synthetic
// workspace row as the signed-in human, and two teams must never collapse to
// the same picker name.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  humanFirstName,
  orgScopeKey,
  workspaceCreateName,
  workspaceDisplayName,
} from "@/lib/org-scope";

describe("orgScopeKey", () => {
  it("uses the Clerk org id when a team is active", () => {
    expect(orgScopeKey("org_acme")).toBe("org_acme");
  });

  it("collapses empty / missing org to personal", () => {
    expect(orgScopeKey(null)).toBe("personal");
    expect(orgScopeKey(undefined)).toBe("personal");
    expect(orgScopeKey("")).toBe("personal");
    expect(orgScopeKey("   ")).toBe("personal");
  });
});

describe("humanFirstName", () => {
  it("returns the personal account first name", () => {
    expect(humanFirstName({ accountType: "user", firstName: "Ada" })).toBe("Ada");
  });

  it("never treats a workspace row as the human", () => {
    expect(humanFirstName({ accountType: "workspace", firstName: "Acme" })).toBe("");
    expect(humanFirstName({ accountType: "workspace", firstName: "Team workspace" })).toBe("");
  });

  it("returns empty when there is no actor", () => {
    expect(humanFirstName(null)).toBe("");
    expect(humanFirstName(undefined)).toBe("");
  });
});

describe("workspaceDisplayName", () => {
  it("prefers the real org name", () => {
    expect(workspaceDisplayName({ firstName: "Acme", fallback: "org_123" })).toBe("Acme");
  });

  it("does not collapse two unnamed teams into the same label", () => {
    expect(
      workspaceDisplayName({ firstName: "Team workspace", fallback: "acme-corp" }),
    ).toBe("acme-corp");
    expect(
      workspaceDisplayName({ firstName: "Team workspace", fallback: "beta-inc" }),
    ).toBe("beta-inc");
  });

  it("falls back to Team workspace only when nothing unique exists", () => {
    expect(workspaceDisplayName({ firstName: null, fallback: null })).toBe("Team workspace");
  });
});

describe("workspaceCreateName", () => {
  it("stamps the Clerk org name on first sight", () => {
    expect(workspaceCreateName({ orgName: "Acme", orgSlug: "acme" })).toBe("Acme");
  });

  it("uses the slug when the name is missing so the picker is unique", () => {
    expect(workspaceCreateName({ orgName: null, orgSlug: "acme-corp" })).toBe("acme-corp");
  });
});

const upsert = vi.fn();
const memberUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: (...args: unknown[]) => upsert(...args) },
    teamMember: { upsert: (...args: unknown[]) => memberUpsert(...args) },
  },
}));

describe("resolveWorkspace first-sight name", () => {
  beforeEach(() => {
    upsert.mockReset();
    memberUpsert.mockReset();
    upsert.mockResolvedValue({ id: "ws-1", clerkId: "org_1", firstName: "acme" });
    memberUpsert.mockResolvedValue({});
  });

  it("creates with the slug when Clerk did not give a display name", async () => {
    const { resolveWorkspace } = await import("@/lib/workspace");
    await resolveWorkspace({
      orgId: "org_1",
      orgSlug: "acme",
      actor: { id: "user-1" } as never,
      orgRole: "org:member",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clerkId: "org_1",
          accountType: "workspace",
          firstName: "acme",
        }),
        update: {},
      }),
    );
  });

  it("updates firstName only when a real org name is provided", async () => {
    const { resolveWorkspace } = await import("@/lib/workspace");
    await resolveWorkspace({
      orgId: "org_1",
      orgName: "Acme",
      orgSlug: "acme",
      actor: { id: "user-1" } as never,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ firstName: "Acme" }),
        update: { firstName: "Acme" },
      }),
    );
  });
});
