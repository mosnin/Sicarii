// API-key authentication is the agent/MCP front door. A revoked, malformed, or
// non-scl_ token must never resolve to a user, and the bearer parser must not
// treat a non-Bearer scheme as a key. These tests pin the shared helpers used
// by every agent endpoint.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const findUnique = vi.fn();
const update = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import {
  hashApiKey,
  generateApiKey,
  authenticateApiKey,
  authenticateApiKeyDetailed,
  bearerFromRequest,
} from "@/lib/api-auth";

function req(authorization?: string): Request {
  return new Request("https://scalar.test/api", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockClear();
});

describe("hashApiKey / generateApiKey", () => {
  it("hashes with sha256 hex and is deterministic", () => {
    const token = "scl_abc";
    expect(hashApiKey(token)).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashApiKey(token)).toBe(hashApiKey(token));
    expect(hashApiKey("scl_abc")).not.toBe(hashApiKey("scl_abd"));
  });

  it("mints a scl_ key whose hash, prefix, and last4 match the plaintext", () => {
    const minted = generateApiKey();
    expect(minted.plaintext.startsWith("scl_")).toBe(true);
    expect(minted.plaintext.length).toBeGreaterThan(12);
    expect(minted.hashedKey).toBe(hashApiKey(minted.plaintext));
    expect(minted.prefix).toBe(minted.plaintext.slice(0, 8));
    expect(minted.last4).toBe(minted.plaintext.slice(-4));
  });
});

describe("bearerFromRequest", () => {
  it("extracts a Bearer token and ignores other schemes", () => {
    expect(bearerFromRequest(req("Bearer scl_live"))).toBe("scl_live");
    expect(bearerFromRequest(req("bearer scl_live"))).toBe("scl_live");
    expect(bearerFromRequest(req("Bearer scl_live "))).toBe("scl_live");
    expect(bearerFromRequest(req("Bearer  scl_live"))).toBeUndefined();
    expect(bearerFromRequest(req("Basic scl_live"))).toBeUndefined();
    expect(bearerFromRequest(req("Bearer"))).toBeUndefined();
    expect(bearerFromRequest(req())).toBeUndefined();
  });
});

describe("authenticateApiKey", () => {
  const user = { id: "u1", clerkId: "cl_1" };

  it("rejects missing tokens and tokens that are not scl_ keys without hitting the db", async () => {
    expect(await authenticateApiKey(undefined)).toBeNull();
    expect(await authenticateApiKey("")).toBeNull();
    expect(await authenticateApiKey("sk_live_notours")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown hash and a revoked key", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await authenticateApiKey("scl_unknown")).toBeNull();

    findUnique.mockResolvedValueOnce({
      id: "k1",
      name: "dead",
      revokedAt: new Date("2026-01-01"),
      user,
    });
    expect(await authenticateApiKey("scl_revokedkey")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns the user for a live key and looks up by the sha256 of the plaintext", async () => {
    findUnique.mockResolvedValue({ id: "k1", name: "Claude", revokedAt: null, user });
    const token = "scl_livekey";
    expect(await authenticateApiKey(token)).toEqual(user);
    expect(findUnique).toHaveBeenCalledWith({
      where: { hashedKey: hashApiKey(token) },
      include: { user: true },
    });
  });
});

describe("authenticateApiKeyDetailed", () => {
  it("returns key id and name so MCP can attribute writes to a specific agent", async () => {
    const user = { id: "u1" };
    findUnique.mockResolvedValue({ id: "k9", name: "Codex", revokedAt: null, user });
    await expect(authenticateApiKeyDetailed("scl_agent")).resolves.toEqual({
      user,
      keyId: "k9",
      keyName: "Codex",
    });
  });

  it("returns null for a revoked key", async () => {
    findUnique.mockResolvedValue({
      id: "k9",
      name: "Codex",
      revokedAt: new Date(),
      user: { id: "u1" },
    });
    await expect(authenticateApiKeyDetailed("scl_agent")).resolves.toBeNull();
  });
});
