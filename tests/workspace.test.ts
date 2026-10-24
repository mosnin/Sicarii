// Workspace provisioning (Teams v1): Clerk org role mapping and the
// provision-on-first-sight membership mirror that share + team billing rely on.

import { describe, it, expect, vi, beforeEach } from "vitest";

const userUpsert = vi.fn();
const memberUpsert = vi.fn();
const memberFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: (...args: unknown[]) => userUpsert(...args) },
    teamMember: {
      upsert: (...args: unknown[]) => memberUpsert(...args),
      findMany: (...args: unknown[]) => memberFindMany(...args),
    },
  },
}));

import { roleFromClerk, resolveWorkspace, listUserWorkspaces } from "@/lib/workspace";

const ACTOR = {
  id: "user-ada",
  clerkId: "user_ada",
  email: "ada@example.com",
  firstName: "Ada",
} as const;

const WORKSPACE = {
  id: "ws-1",
  clerkId: "org_1",
  accountType: "workspace",
  firstName: "Acme",
  plan: "free",
  creditsRemaining: 200,
};

beforeEach(() => {
  userUpsert.mockReset();
  memberUpsert.mockReset();
  memberFindMany.mockReset();
  userUpsert.mockResolvedValue(WORKSPACE);
  memberUpsert.mockResolvedValue({ workspaceId: WORKSPACE.id, userId: ACTOR.id, role: "member" });
});

describe("roleFromClerk", () => {
  it("maps Clerk admin roles to admin and everything else to member", () => {
    expect(roleFromClerk("org:admin")).toBe("admin");
    expect(roleFromClerk("admin")).toBe("admin");
    expect(roleFromClerk("org:member")).toBe("member");
    expect(roleFromClerk("member")).toBe("member");
    expect(roleFromClerk(null)).toBe("member");
    expect(roleFromClerk(undefined)).toBe("member");
    expect(roleFromClerk("org:manager")).toBe("member");
  });
});

describe("resolveWorkspace", () => {
  it("upserts the workspace account on clerkId and mirrors the actor as a member", async () => {
    const row = await resolveWorkspace({
      orgId: "org_1",
      orgName: "Acme",
      actor: ACTOR as never,
      orgRole: "org:admin",
    });

    expect(row).toEqual(WORKSPACE);
    expect(userUpsert).toHaveBeenCalledWith({
      where: { clerkId: "org_1" },
      update: { firstName: "Acme" },
      create: {
        clerkId: "org_1",
        accountType: "workspace",
        email: "",
        firstName: "Acme",
        plan: "free",
        creditsRemaining: 200,
      },
    });
    expect(memberUpsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: WORKSPACE.id, userId: ACTOR.id } },
      update: { role: "admin" },
      create: {
        workspaceId: WORKSPACE.id,
        userId: ACTOR.id,
        role: "admin",
      },
    });
  });

  it("does not rewrite the workspace display name when Clerk sends no org name", async () => {
    await resolveWorkspace({
      orgId: "org_1",
      actor: ACTOR as never,
      orgRole: "org:member",
    });
    expect(userUpsert.mock.calls[0][0].update).toEqual({});
    expect(memberUpsert.mock.calls[0][0].update).toEqual({ role: "member" });
  });
});

describe("listUserWorkspaces", () => {
  it("returns id, display name, and role for picker UIs", async () => {
    memberFindMany.mockResolvedValue([
      { role: "admin", workspace: { id: "ws-1", firstName: "Acme" } },
      { role: "member", workspace: { id: "ws-2", firstName: null } },
    ]);

    await expect(listUserWorkspaces("user-ada")).resolves.toEqual([
      { workspaceId: "ws-1", name: "Acme", role: "admin" },
      { workspaceId: "ws-2", name: "Team workspace", role: "member" },
    ]);
    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-ada" } }),
    );
  });
});
