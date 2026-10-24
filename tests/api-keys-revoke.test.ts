// Workspace API keys are admin-gated on mint (POST /api/keys). Revoke must
// use the same gate: getAuthenticatedUser() returns the workspace account in
// team context, so a member's DELETE would otherwise match key.userId and
// disable every connected agent.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: (...args: unknown[]) => findUnique(...(args as [never])),
      update: (...args: unknown[]) => update(...(args as [never])),
    },
  },
}));

const getAuthContextMock = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContextMock(...(args as [])),
}));

import { DELETE } from "@/app/api/keys/[id]/route";

const WORKSPACE = { id: "ws-1" };
const KEY_ID = "key-1";

function req() {
  return new NextRequest(new URL(`https://scalar.test/api/keys/${KEY_ID}`), {
    method: "DELETE",
  });
}

describe("DELETE /api/keys/[id] - team revoke is admin-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: KEY_ID, userId: WORKSPACE.id, revokedAt: null });
    update.mockResolvedValue({ id: KEY_ID, revokedAt: new Date() });
  });

  it("rejects a team member before touching the key", async () => {
    getAuthContextMock.mockResolvedValue({
      account: WORKSPACE,
      actor: { id: "member-1" },
      workspaceRole: "member",
    });

    const res = await DELETE(req(), { params: Promise.resolve({ id: KEY_ID }) });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Only a team admin can revoke workspace API keys.",
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("lets a team admin revoke a workspace key", async () => {
    getAuthContextMock.mockResolvedValue({
      account: WORKSPACE,
      actor: { id: "admin-1" },
      workspaceRole: "admin",
    });

    const res = await DELETE(req(), { params: Promise.resolve({ id: KEY_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: KEY_ID },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("still lets a personal-account owner revoke their own key", async () => {
    getAuthContextMock.mockResolvedValue({
      account: { id: "user-1" },
      actor: { id: "user-1" },
      workspaceRole: null,
    });
    findUnique.mockResolvedValue({ id: KEY_ID, userId: "user-1", revokedAt: null });

    const res = await DELETE(req(), { params: Promise.resolve({ id: KEY_ID }) });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });
});
