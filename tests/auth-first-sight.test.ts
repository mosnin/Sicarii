// REST routes resolve the caller through getAuthContext -> personalRow, not
// getDbUser. A first session before the Clerk webhook fires must grant
// free/200 (the public plan), never the schema defaults (beta/10000) which
// are only for migrated existing users. #96 covers the dashboard getDbUser
// path; this pins the REST twin so the two cannot drift.

import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.fn();
const currentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => auth(),
  currentUser: () => currentUser(),
}));

const findUnique = vi.fn();
const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (args: unknown) => findUnique(args),
      upsert: (args: unknown) => upsert(args),
    },
  },
}));

const resolveWorkspace = vi.fn();
vi.mock("@/lib/workspace", () => ({
  resolveWorkspace: (...args: unknown[]) => resolveWorkspace(...args),
}));

import { getAuthContext, getAuthenticatedUser } from "@/lib/auth-utils";

const ACTOR = {
  id: "u_personal",
  clerkId: "user_abc",
  email: "ana@example.com",
  plan: "free",
  creditsRemaining: 200,
};

beforeEach(() => {
  auth.mockReset();
  currentUser.mockReset();
  findUnique.mockReset();
  upsert.mockReset();
  resolveWorkspace.mockReset();
});

describe("getAuthContext first-sight grant", () => {
  it("provisions a missing personal row as free/200, not beta/10000", async () => {
    auth.mockResolvedValue({ userId: "user_abc", orgId: null, orgRole: null });
    findUnique.mockResolvedValue(null);
    currentUser.mockResolvedValue({
      firstName: "Ana",
      lastName: "Ruiz",
      imageUrl: "https://img.example/ana",
      emailAddresses: [{ emailAddress: "ana@example.com" }],
    });
    upsert.mockResolvedValue(ACTOR);

    const ctx = await getAuthContext();

    expect(ctx.account).toEqual(ACTOR);
    expect(ctx.actor).toEqual(ACTOR);
    expect(ctx.workspaceRole).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);
    const create = (upsert.mock.calls[0]![0] as { create: Record<string, unknown> }).create;
    expect(create.plan).toBe("free");
    expect(create.creditsRemaining).toBe(200);
    expect(create.plan).not.toBe("beta");
    expect(create.creditsRemaining).not.toBe(10000);
    expect(create.email).toBe("ana@example.com");
  });

  it("returns an existing personal row without rewriting plan or credits", async () => {
    const existing = { ...ACTOR, plan: "pro", creditsRemaining: 15000 };
    auth.mockResolvedValue({ userId: "user_abc", orgId: null, orgRole: null });
    findUnique.mockResolvedValue(existing);

    const ctx = await getAuthContext();

    expect(ctx.account).toEqual(existing);
    expect(upsert).not.toHaveBeenCalled();
    expect(currentUser).not.toHaveBeenCalled();
  });

  it("throws a 401 NextResponse when signed out", async () => {
    auth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    await expect(getAuthContext()).rejects.toMatchObject({ status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("scopes to the workspace row when Clerk has an active org", async () => {
    const workspace = { id: "ws_1", clerkId: "org_1", accountType: "workspace" };
    auth.mockResolvedValue({ userId: "user_abc", orgId: "org_1", orgRole: "org:admin" });
    findUnique.mockResolvedValue(ACTOR);
    resolveWorkspace.mockResolvedValue(workspace);

    const ctx = await getAuthContext();

    expect(resolveWorkspace).toHaveBeenCalledWith({
      orgId: "org_1",
      actor: ACTOR,
      orgRole: "org:admin",
    });
    expect(ctx.account).toEqual(workspace);
    expect(ctx.actor).toEqual(ACTOR);
    expect(ctx.workspaceRole).toBe("admin");
  });
});

describe("getAuthenticatedUser", () => {
  it("returns the workspace account in team context (REST queries must not stay personal)", async () => {
    const workspace = { id: "ws_1", clerkId: "org_1", accountType: "workspace" };
    auth.mockResolvedValue({ userId: "user_abc", orgId: "org_1", orgRole: "org:member" });
    findUnique.mockResolvedValue(ACTOR);
    resolveWorkspace.mockResolvedValue(workspace);

    await expect(getAuthenticatedUser()).resolves.toEqual(workspace);
  });
});
