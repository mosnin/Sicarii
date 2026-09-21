// DELETE /api/keys/[id] is a soft revoke. The lookup must belong to the
// authenticated account — a guessed id on another tenant's key must 404
// and never set revokedAt, or an attacker can kill a teammate's (or a
// stranger's) live agent credential.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = { id: "user-1" };
const getAuthenticatedUser = vi.fn(async () => AUTH_USER);
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
}));

const apiKeyFindUnique = vi.fn();
const apiKeyUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: (...args: unknown[]) => apiKeyFindUnique(...args),
      update: (...args: unknown[]) => apiKeyUpdate(...args),
    },
  },
}));

import { DELETE } from "@/app/api/keys/[id]/route";

function req() {
  return new NextRequest(new URL("https://scalar.test/api/keys/key-1"), {
    method: "DELETE",
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/keys/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue(AUTH_USER);
    apiKeyFindUnique.mockResolvedValue(null);
    apiKeyUpdate.mockResolvedValue({ id: "key-1", revokedAt: new Date() });
  });

  it("404s a key owned by someone else and never revokes", async () => {
    apiKeyFindUnique.mockResolvedValue({ id: "key-foreign", userId: "user-other" });
    const res = await DELETE(req(), params("key-foreign"));
    expect(res.status).toBe(404);
    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });

  it("404s a missing key", async () => {
    apiKeyFindUnique.mockResolvedValue(null);
    const res = await DELETE(req(), params("key-missing"));
    expect(res.status).toBe(404);
    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });

  it("revokes the caller's own key", async () => {
    apiKeyFindUnique.mockResolvedValue({ id: "key-1", userId: "user-1" });
    const res = await DELETE(req(), params("key-1"));
    expect(res.status).toBe(200);
    expect(apiKeyUpdate).toHaveBeenCalledTimes(1);
    expect(apiKeyUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "key-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns 401 when the session is missing", async () => {
    getAuthenticatedUser.mockRejectedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(req(), params("key-1"));
    expect(res.status).toBe(401);
    expect(apiKeyFindUnique).not.toHaveBeenCalled();
    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });
});
