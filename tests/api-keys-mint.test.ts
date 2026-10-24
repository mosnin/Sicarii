// Workspace API keys are minted onto the shared team account. A member who
// can mint one can impersonate every connected agent. POST /api/keys must
// refuse members before create, validate the name, and honor the rate limit.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      create: (...args: unknown[]) => create(...(args as [never])),
    },
  },
}));

const getAuthContextMock = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContextMock(...args),
  getAuthenticatedUser: vi.fn(),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

import { POST } from "@/app/api/keys/route";

const WORKSPACE = { id: "ws-1" };
const ACTOR = { id: "human-1" };

function req(body: unknown) {
  return new NextRequest("https://scalar.test/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/keys — mint gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: Date.now() + 60_000 });
    create.mockResolvedValue({
      id: "key-1",
      name: "Claude",
      prefix: "scl_abcd",
      last4: "wxyz",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
  });

  it("rejects a team member before creating a key", async () => {
    getAuthContextMock.mockResolvedValue({
      account: WORKSPACE,
      actor: ACTOR,
      workspaceRole: "member",
    });

    const res = await POST(req({ name: "stolen" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Only a team admin can create workspace API keys.",
    });
    expect(create).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized name without writing", async () => {
    getAuthContextMock.mockResolvedValue({
      account: WORKSPACE,
      actor: ACTOR,
      workspaceRole: "admin",
    });

    const empty = await POST(req({ name: "   " }));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "A name is required" });

    const long = await POST(req({ name: "x".repeat(81) }));
    expect(long.status).toBe(400);

    expect(create).not.toHaveBeenCalled();
  });

  it("rate-limits minting per workspace and does not create on 429", async () => {
    getAuthContextMock.mockResolvedValue({
      account: WORKSPACE,
      actor: ACTOR,
      workspaceRole: "admin",
    });
    checkRateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: Date.now() + 60_000 });

    const res = await POST(req({ name: "Claude" }));
    expect(res.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(`keys:create:${WORKSPACE.id}`, 10, 60 * 60_000);
  });

  it("lets a team admin mint a workspace key and returns plaintext once", async () => {
    getAuthContextMock.mockResolvedValue({
      account: WORKSPACE,
      actor: ACTOR,
      workspaceRole: "admin",
    });

    const res = await POST(req({ name: "Claude" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: { name: string }; plaintext: string };
    expect(body.key.name).toBe("Claude");
    expect(body.plaintext.startsWith("scl_")).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]![0] as {
      data: { userId: string; createdById?: string; hashedKey: string };
    };
    expect(data.data.userId).toBe(WORKSPACE.id);
    expect(data.data.createdById).toBe(ACTOR.id);
    expect(data.data.hashedKey).not.toBe(body.plaintext);
  });

  it("lets a personal-account owner mint without a createdBy stamp", async () => {
    getAuthContextMock.mockResolvedValue({
      account: { id: "user-1" },
      actor: { id: "user-1" },
      workspaceRole: null,
    });

    const res = await POST(req({ name: "Personal" }));
    expect(res.status).toBe(201);
    const data = create.mock.calls[0]![0] as { data: { userId: string; createdById?: string } };
    expect(data.data.userId).toBe("user-1");
    expect(data.data.createdById).toBeUndefined();
  });

  it("returns the thrown NextResponse when the session is missing", async () => {
    getAuthContextMock.mockRejectedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(req({ name: "Claude" }));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});
