// Hybrid auth for routes that both agents and humans call (x402 pay-per-call).
// The API key is tried FIRST so agent traffic never depends on a browser
// session. A workspace-minted key resolves to the workspace account (pooled
// team meter). A missing/invalid key falls through to the Clerk session;
// neither identity → null (never a thrown 401 — callers treat null as
// unauthenticated).
//
// A regression here either silently bills the human sitting in the browser
// for an agent's call, or drops a valid scl_ key on the floor.

import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateApiKey = vi.fn();
const bearerFromRequest = vi.fn();
vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: (...a: unknown[]) => authenticateApiKey(...a),
  bearerFromRequest: (...a: unknown[]) => bearerFromRequest(...a),
}));

const auth = vi.fn();
const currentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...a: unknown[]) => auth(...a),
  currentUser: (...a: unknown[]) => currentUser(...a),
}));

const userFindUnique = vi.fn();
const userUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      upsert: (...a: unknown[]) => userUpsert(...a),
    },
  },
}));

const resolveWorkspace = vi.fn();
vi.mock("@/lib/workspace", () => ({
  resolveWorkspace: (...a: unknown[]) => resolveWorkspace(...a),
}));

import { resolveRequestUser } from "@/lib/auth-utils";

const KEY_USER = { id: "workspace-1", accountType: "workspace", clerkId: "org_1" };
const CLERK_USER = { id: "user-1", accountType: "personal", clerkId: "user_clerk" };

function req(): Request {
  return new Request("https://scalar.test/api/x402/topup");
}

beforeEach(() => {
  vi.clearAllMocks();
  bearerFromRequest.mockReturnValue(undefined);
  authenticateApiKey.mockResolvedValue(null);
  auth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
  currentUser.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  userUpsert.mockResolvedValue(CLERK_USER);
  resolveWorkspace.mockResolvedValue(KEY_USER);
});

describe("resolveRequestUser key-first", () => {
  it("returns the API-key user and never opens a Clerk session", async () => {
    bearerFromRequest.mockReturnValue("scl_live_abc");
    authenticateApiKey.mockResolvedValue(KEY_USER);

    await expect(resolveRequestUser(req())).resolves.toEqual(KEY_USER);
    expect(authenticateApiKey).toHaveBeenCalledWith("scl_live_abc");
    expect(auth).not.toHaveBeenCalled();
    expect(currentUser).not.toHaveBeenCalled();
  });

  it("falls through to the Clerk session when the bearer is not a valid key", async () => {
    bearerFromRequest.mockReturnValue("not-a-key");
    authenticateApiKey.mockResolvedValue(null);
    auth.mockResolvedValue({ userId: "user_clerk", orgId: null, orgRole: null });
    userFindUnique.mockResolvedValue(CLERK_USER);

    await expect(resolveRequestUser(req())).resolves.toEqual(CLERK_USER);
    expect(auth).toHaveBeenCalled();
    expect(resolveWorkspace).not.toHaveBeenCalled();
  });

  it("returns the workspace account when the Clerk session is in a team org", async () => {
    auth.mockResolvedValue({ userId: "user_clerk", orgId: "org_1", orgRole: "org:admin" });
    userFindUnique.mockResolvedValue(CLERK_USER);
    resolveWorkspace.mockResolvedValue(KEY_USER);

    await expect(resolveRequestUser(req())).resolves.toEqual(KEY_USER);
    expect(resolveWorkspace).toHaveBeenCalledWith({
      orgId: "org_1",
      actor: CLERK_USER,
      orgRole: "org:admin",
    });
  });

  it("returns null when there is no key and no signed-in session (never throws)", async () => {
    auth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    await expect(resolveRequestUser(req())).resolves.toBeNull();
  });

  it("returns null when an invalid key and a signed-out session coincide", async () => {
    bearerFromRequest.mockReturnValue("scl_revoked");
    authenticateApiKey.mockResolvedValue(null);
    auth.mockResolvedValue({ userId: null });
    await expect(resolveRequestUser(req())).resolves.toBeNull();
    expect(authenticateApiKey).toHaveBeenCalled();
  });
});
