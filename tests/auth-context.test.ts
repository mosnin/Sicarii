// Auth context: personal vs workspace scoping, first-sight free-plan grant,
// and resolveRequestUser preferring an API key over a Clerk session.
// A regression here shows the wrong org's CRM (or a workspace agent spending
// a personal meter).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, currentUser } = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));
const { userFindUnique, userUpsert } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpsert: vi.fn(),
}));
const { resolveWorkspace } = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
}));
const { authenticateApiKey, bearerFromRequest } = vi.hoisted(() => ({
  authenticateApiKey: vi.fn(),
  bearerFromRequest: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      upsert: (...a: unknown[]) => userUpsert(...a),
    },
  },
}));
vi.mock("@/lib/workspace", () => ({ resolveWorkspace }));
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey, bearerFromRequest }));

import { getAuthContext, getAuthenticatedUser, resolveRequestUser } from "@/lib/auth-utils";
import { getDbUser } from "@/lib/server-user";

const ACTOR = {
  id: "user-ada",
  clerkId: "user_ada",
  email: "ada@example.com",
  plan: "free",
  creditsRemaining: 200,
};
const WORKSPACE = {
  id: "ws-1",
  clerkId: "org_1",
  accountType: "workspace",
  plan: "team",
  creditsRemaining: 30000,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: "user_ada", orgId: null, orgRole: null });
  currentUser.mockResolvedValue({
    id: "user_ada",
    firstName: "Ada",
    lastName: "Lovelace",
    imageUrl: null,
    emailAddresses: [{ emailAddress: "ada@example.com" }],
  });
  userFindUnique.mockResolvedValue(ACTOR);
  userUpsert.mockResolvedValue(ACTOR);
  resolveWorkspace.mockResolvedValue(WORKSPACE);
  bearerFromRequest.mockReturnValue(null);
  authenticateApiKey.mockResolvedValue(null);
});

describe("getAuthContext", () => {
  it("throws a 401 response when there is no Clerk session", async () => {
    auth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });

    await expect(getAuthContext()).rejects.toMatchObject({ status: 401 });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(resolveWorkspace).not.toHaveBeenCalled();
  });

  it("scopes to the personal row when no org is active", async () => {
    const ctx = await getAuthContext();
    expect(ctx.account).toEqual(ACTOR);
    expect(ctx.actor).toEqual(ACTOR);
    expect(ctx.workspaceRole).toBeNull();
    expect(resolveWorkspace).not.toHaveBeenCalled();
  });

  it("scopes queries to the workspace row and maps Clerk admin → admin", async () => {
    auth.mockResolvedValue({ userId: "user_ada", orgId: "org_1", orgRole: "org:admin" });

    const ctx = await getAuthContext();
    expect(ctx.account).toEqual(WORKSPACE);
    expect(ctx.actor).toEqual(ACTOR);
    expect(ctx.workspaceRole).toBe("admin");
    expect(resolveWorkspace).toHaveBeenCalledWith({
      orgId: "org_1",
      actor: ACTOR,
      orgRole: "org:admin",
    });
  });

  it("maps a non-admin org role to member", async () => {
    auth.mockResolvedValue({ userId: "user_ada", orgId: "org_1", orgRole: "org:member" });

    const ctx = await getAuthContext();
    expect(ctx.account).toEqual(WORKSPACE);
    expect(ctx.workspaceRole).toBe("member");
  });

  it("getAuthenticatedUser returns the account (workspace when in team context)", async () => {
    auth.mockResolvedValue({ userId: "user_ada", orgId: "org_1", orgRole: "org:admin" });
    await expect(getAuthenticatedUser()).resolves.toEqual(WORKSPACE);
  });
});

describe("first-sight user grant", () => {
  it("provisions a missing personal row as free/200, never the schema beta default", async () => {
    userFindUnique.mockResolvedValue(null);
    userUpsert.mockResolvedValue({ ...ACTOR, plan: "free", creditsRemaining: 200 });

    await getAuthContext();

    expect(userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkId: "user_ada" },
        create: expect.objectContaining({
          clerkId: "user_ada",
          email: "ada@example.com",
          plan: "free",
          creditsRemaining: 200,
        }),
      }),
    );
  });

  it("getDbUser uses the same free/200 grant and then resolves the workspace", async () => {
    auth.mockResolvedValue({ userId: "user_ada", orgId: "org_1", orgRole: "org:member" });

    await expect(getDbUser()).resolves.toEqual(WORKSPACE);
    expect(userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ plan: "free", creditsRemaining: 200 }),
      }),
    );
    expect(resolveWorkspace).toHaveBeenCalledWith({
      orgId: "org_1",
      actor: ACTOR,
      orgRole: "org:member",
    });
  });

  it("getDbUser returns null when signed out", async () => {
    currentUser.mockResolvedValue(null);
    await expect(getDbUser()).resolves.toBeNull();
    expect(userUpsert).not.toHaveBeenCalled();
  });
});

describe("resolveRequestUser", () => {
  it("prefers a valid API key over a Clerk session so agents do not need a cookie", async () => {
    const agentAccount = { id: "ws-1", clerkId: "org_1" };
    bearerFromRequest.mockReturnValue("scl_live_abc");
    authenticateApiKey.mockResolvedValue(agentAccount);

    await expect(resolveRequestUser(new Request("https://example.com"))).resolves.toEqual(
      agentAccount,
    );
    expect(auth).not.toHaveBeenCalled();
  });

  it("falls through to the Clerk session when the bearer token is missing or revoked", async () => {
    bearerFromRequest.mockReturnValue("scl_revoked");
    authenticateApiKey.mockResolvedValue(null);

    await expect(resolveRequestUser(new Request("https://example.com"))).resolves.toEqual(ACTOR);
  });

  it("returns null when neither a key nor a session identifies a user", async () => {
    auth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    await expect(resolveRequestUser(new Request("https://example.com"))).resolves.toBeNull();
  });
});
