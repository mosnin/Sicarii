// First-sight provisioning is the billing hinge for every new human and every
// new team workspace. Both getDbUser (dashboard) and resolveWorkspace (org
// context) must grant the documented free/200 allotment, NEVER the schema
// defaults (beta/10000, which exist only for already-migrated users). An
// update of a live workspace must refresh the display name and nothing else,
// or a Clerk org rename would silently wipe the team's plan and purchased
// credits. Membership is mirrored so share + admin gates have a row to read.
//
// Prisma and Clerk are mocked. No network, no database.

import { describe, it, expect, vi, beforeEach } from "vitest";

const userUpsert = vi.fn();
const teamMemberUpsert = vi.fn();
const teamMemberFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: (...args: unknown[]) => userUpsert(...args),
    },
    teamMember: {
      upsert: (...args: unknown[]) => teamMemberUpsert(...args),
      findMany: (...args: unknown[]) => teamMemberFindMany(...args),
    },
  },
}));

const currentUser = vi.fn();
const auth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: (...args: unknown[]) => currentUser(...args),
  auth: (...args: unknown[]) => auth(...args),
}));

import { resolveWorkspace, listUserWorkspaces } from "@/lib/workspace";
import { getDbUser } from "@/lib/server-user";

const ACTOR = {
  id: "user-1",
  clerkId: "user_clerk",
  email: "ana@example.com",
  accountType: "personal",
  plan: "pro",
  creditsRemaining: 500,
};

const WORKSPACE = {
  id: "ws-1",
  clerkId: "org_1",
  accountType: "workspace",
  email: "",
  firstName: "Acme",
  plan: "free",
  creditsRemaining: 200,
};

beforeEach(() => {
  vi.clearAllMocks();
  userUpsert.mockResolvedValue(WORKSPACE);
  teamMemberUpsert.mockResolvedValue({ workspaceId: "ws-1", userId: "user-1", role: "admin" });
  teamMemberFindMany.mockResolvedValue([]);
  currentUser.mockResolvedValue(null);
  auth.mockResolvedValue({ orgId: null, orgRole: null });
});

describe("resolveWorkspace provision", () => {
  it("creates a workspace on first sight with free/200, never the schema beta/10000 defaults", async () => {
    await resolveWorkspace({
      orgId: "org_1",
      orgName: "Acme",
      actor: ACTOR as never,
      orgRole: "org:admin",
    });

    expect(userUpsert).toHaveBeenCalledTimes(1);
    const call = userUpsert.mock.calls[0][0] as {
      where: { clerkId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(call.where.clerkId).toBe("org_1");
    expect(call.create).toMatchObject({
      clerkId: "org_1",
      accountType: "workspace",
      plan: "free",
      creditsRemaining: 200,
      firstName: "Acme",
    });
    expect(call.create.plan).not.toBe("beta");
    expect(call.create.creditsRemaining).not.toBe(10000);
  });

  it("on update, refreshes only the display name and never touches plan or credits", async () => {
    await resolveWorkspace({
      orgId: "org_1",
      orgName: "Acme Renamed",
      actor: ACTOR as never,
      orgRole: "org:member",
    });

    const call = userUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(call.update).toEqual({ firstName: "Acme Renamed" });
    expect(call.update).not.toHaveProperty("plan");
    expect(call.update).not.toHaveProperty("creditsRemaining");
  });

  it("does not write a name when Clerk sent none, so an unnamed org cannot blank the row", async () => {
    await resolveWorkspace({
      orgId: "org_1",
      actor: ACTOR as never,
      orgRole: "org:member",
    });

    const call = userUpsert.mock.calls[0][0] as { update: Record<string, unknown>; create: Record<string, unknown> };
    expect(call.update).toEqual({});
    expect(call.create.firstName).toBe("Team workspace");
  });

  it("upserts membership with the Clerk role so a member can never be stored as admin", async () => {
    await resolveWorkspace({
      orgId: "org_1",
      orgName: "Acme",
      actor: ACTOR as never,
      orgRole: "org:member",
    });

    expect(teamMemberUpsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "ws-1", userId: "user-1" } },
      update: { role: "member" },
      create: { workspaceId: "ws-1", userId: "user-1", role: "member" },
    });
  });

  it("returns the workspace row, not the acting human", async () => {
    const result = await resolveWorkspace({
      orgId: "org_1",
      actor: ACTOR as never,
    });
    expect(result).toEqual(WORKSPACE);
    expect(result.id).not.toBe(ACTOR.id);
  });
});

describe("listUserWorkspaces", () => {
  it("is scoped to the calling human and surfaces id, name, and role", async () => {
    teamMemberFindMany.mockResolvedValue([
      { workspace: { id: "ws-1", firstName: "Acme" }, role: "admin" },
      { workspace: { id: "ws-2", firstName: null }, role: "member" },
    ]);

    await expect(listUserWorkspaces("user-1")).resolves.toEqual([
      { workspaceId: "ws-1", name: "Acme", role: "admin" },
      { workspaceId: "ws-2", name: "Team workspace", role: "member" },
    ]);
    expect(teamMemberFindMany.mock.calls[0][0]).toMatchObject({ where: { userId: "user-1" } });
  });
});

describe("getDbUser first-sight grant", () => {
  it("returns null when signed out and never writes a user row", async () => {
    currentUser.mockResolvedValue(null);
    await expect(getDbUser()).resolves.toBeNull();
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it("provisions a personal row as free/200 when Clerk has not yet fired the webhook", async () => {
    currentUser.mockResolvedValue({
      id: "user_clerk",
      emailAddresses: [{ emailAddress: "ana@example.com" }],
      firstName: "Ana",
      lastName: "Ruiz",
      imageUrl: "https://img",
    });
    auth.mockResolvedValue({ orgId: null, orgRole: null });
    userUpsert.mockResolvedValue({ ...ACTOR, plan: "free", creditsRemaining: 200 });

    const user = await getDbUser();
    expect(user?.id).toBe("user-1");

    const create = (userUpsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;
    expect(create).toMatchObject({
      clerkId: "user_clerk",
      email: "ana@example.com",
      plan: "free",
      creditsRemaining: 200,
    });
    expect(create.plan).not.toBe("beta");
    expect(create.creditsRemaining).not.toBe(10000);
    expect(teamMemberUpsert).not.toHaveBeenCalled();
  });

  it("returns the workspace row when a Clerk org is the active context", async () => {
    currentUser.mockResolvedValue({
      id: "user_clerk",
      emailAddresses: [{ emailAddress: "ana@example.com" }],
      firstName: "Ana",
      lastName: "Ruiz",
      imageUrl: null,
    });
    auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:admin" });
    userUpsert
      .mockResolvedValueOnce(ACTOR)
      .mockResolvedValueOnce(WORKSPACE);

    await expect(getDbUser()).resolves.toEqual(WORKSPACE);
    expect(userUpsert).toHaveBeenCalledTimes(2);
    expect(teamMemberUpsert).toHaveBeenCalledTimes(1);
  });
});
