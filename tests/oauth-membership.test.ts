// Removed team members must not keep MCP access via a workspace-scoped OAuth
// token. Browser routes drop Clerk orgId on removal; OAuth JWTs do not, so
// every refresh and MCP request re-checks TeamMember against the bound actor.

import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindUnique = vi.fn();
const teamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    teamMember: { findUnique: (...args: unknown[]) => teamMemberFindUnique(...args) },
    revokedToken: { create: vi.fn() },
  },
}));

import { oauthActorStillAuthorized } from "@/lib/oauth";

beforeEach(() => {
  userFindUnique.mockReset();
  teamMemberFindUnique.mockReset();
});

describe("oauthActorStillAuthorized", () => {
  it("rejects a token whose account row is gone", async () => {
    userFindUnique.mockResolvedValue(null);
    expect(await oauthActorStillAuthorized("missing")).toBe(false);
    expect(teamMemberFindUnique).not.toHaveBeenCalled();
  });

  it("allows a personal-account token with no actor (legacy)", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", accountType: "user" });
    expect(await oauthActorStillAuthorized("user_1")).toBe(true);
    expect(teamMemberFindUnique).not.toHaveBeenCalled();
  });

  it("allows a personal-account token bound to that same human", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", accountType: "user" });
    expect(await oauthActorStillAuthorized("user_1", "user_1")).toBe(true);
  });

  it("rejects a personal-account token bound to a different human", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", accountType: "user" });
    expect(await oauthActorStillAuthorized("user_1", "user_other")).toBe(false);
  });

  it("rejects a workspace token that does not name the authorizing human", async () => {
    userFindUnique.mockResolvedValue({ id: "ws_1", accountType: "workspace" });
    expect(await oauthActorStillAuthorized("ws_1")).toBe(false);
    expect(teamMemberFindUnique).not.toHaveBeenCalled();
  });

  it("allows a workspace token whose actor is still a member", async () => {
    userFindUnique.mockResolvedValue({ id: "ws_1", accountType: "workspace" });
    teamMemberFindUnique.mockResolvedValue({ id: "m1" });
    expect(await oauthActorStillAuthorized("ws_1", "human_1")).toBe(true);
    expect(teamMemberFindUnique).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "ws_1", userId: "human_1" } },
      select: { id: true },
    });
  });

  it("rejects a workspace token after the actor is removed from the team", async () => {
    userFindUnique.mockResolvedValue({ id: "ws_1", accountType: "workspace" });
    teamMemberFindUnique.mockResolvedValue(null);
    expect(await oauthActorStillAuthorized("ws_1", "human_ex")).toBe(false);
  });
});
