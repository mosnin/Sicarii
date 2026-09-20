// POST /api/keys is how agents get a workspace-scoped scl_ key. In team
// context only an org admin may mint: a member minting would share the
// pooled meter and the shared CRM with an agent the rest of the team did
// not authorize. Personal context (no workspace role) still mints a
// personal key.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContext(...args),
  getAuthenticatedUser: vi.fn(),
}));

const checkRateLimit = vi.fn(async () => ({ success: true, remaining: 9, resetAt: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const apiKeyCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      create: (...args: unknown[]) => apiKeyCreate(...args),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-auth", () => ({
  generateApiKey: () => ({
    plaintext: "scl_testplaintext0000000000000001",
    hashedKey: "hashed",
    prefix: "scl_test",
    last4: "0001",
  }),
}));

import { POST } from "@/app/api/keys/route";

function req(body: unknown) {
  return new NextRequest(new URL("https://scalar.test/api/keys"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/keys role gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: 0 });
    apiKeyCreate.mockResolvedValue({
      id: "key-1",
      name: "Codex",
      prefix: "scl_test",
      last4: "0001",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
  });

  it("refuses a workspace member and never inserts a key", async () => {
    getAuthContext.mockResolvedValue({
      account: { id: "ws-1" },
      actor: { id: "user-member" },
      workspaceRole: "member",
    });

    const res = await POST(req({ name: "rogue agent" }));
    expect(res.status).toBe(403);
    expect(apiKeyCreate).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("lets a workspace admin mint a key stamped with the actor", async () => {
    getAuthContext.mockResolvedValue({
      account: { id: "ws-1" },
      actor: { id: "user-admin" },
      workspaceRole: "admin",
    });

    const res = await POST(req({ name: "Codex" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plaintext?: string };
    expect(body.plaintext).toMatch(/^scl_/);
    expect(apiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "ws-1",
          name: "Codex",
          createdById: "user-admin",
        }),
      }),
    );
  });

  it("lets a personal account mint without an actor stamp", async () => {
    getAuthContext.mockResolvedValue({
      account: { id: "user-1" },
      actor: { id: "user-1" },
      workspaceRole: null,
    });

    const res = await POST(req({ name: "personal" }));
    expect(res.status).toBe(201);
    expect(apiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          name: "personal",
        }),
      }),
    );
    const data = apiKeyCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("createdById");
  });

  it("rejects a blank name before insert", async () => {
    getAuthContext.mockResolvedValue({
      account: { id: "user-1" },
      actor: { id: "user-1" },
      workspaceRole: null,
    });
    const res = await POST(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });

  it("surfaces a 401 thrown by getAuthContext", async () => {
    getAuthContext.mockRejectedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await POST(req({ name: "Codex" }));
    expect(res.status).toBe(401);
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });
});
