// API key auth: prefix gate, sha256 lookup, revoked-key reject, bearer parse.
// A regression here would let a revoked or malformed token act as a workspace.

import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const USER = { id: "u1", email: "owner@example.com" };

beforeEach(() => {
  findUnique.mockReset();
  update.mockClear();
});

describe("hashApiKey / generateApiKey", () => {
  it("hashes with sha256 hex and is deterministic", () => {
    const token = "scl_example-token";
    expect(hashApiKey(token)).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashApiKey(token)).toBe(hashApiKey(token));
    expect(hashApiKey(token)).not.toBe(hashApiKey("scl_other"));
  });

  it("mints a scl_ key whose stored hash matches the plaintext", () => {
    const key = generateApiKey();
    expect(key.plaintext.startsWith("scl_")).toBe(true);
    expect(key.hashedKey).toBe(hashApiKey(key.plaintext));
    expect(key.last4).toBe(key.plaintext.slice(-4));
    expect(key.prefix).toBe(key.plaintext.slice(0, 8));
    expect(key.plaintext).not.toBe(key.hashedKey);
  });
});

describe("authenticateApiKey", () => {
  it("rejects missing tokens and tokens without the scl_ prefix without hitting the db", async () => {
    await expect(authenticateApiKey()).resolves.toBeNull();
    await expect(authenticateApiKey("")).resolves.toBeNull();
    await expect(authenticateApiKey("sk_not_ours")).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the key's user and stamps lastUsedAt", async () => {
    findUnique.mockResolvedValue({
      id: "k1",
      name: "ci",
      revokedAt: null,
      user: USER,
    });
    const token = "scl_live_token";
    await expect(authenticateApiKey(token)).resolves.toEqual(USER);
    expect(findUnique).toHaveBeenCalledWith({
      where: { hashedKey: hashApiKey(token) },
      include: { user: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("rejects a revoked key", async () => {
    findUnique.mockResolvedValue({
      id: "k1",
      name: "old",
      revokedAt: new Date("2026-01-01T00:00:00Z"),
      user: USER,
    });
    await expect(authenticateApiKey("scl_revoked")).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an unknown hash", async () => {
    findUnique.mockResolvedValue(null);
    await expect(authenticateApiKey("scl_unknown")).resolves.toBeNull();
  });
});

describe("authenticateApiKeyDetailed", () => {
  it("returns user plus key identity for an active key", async () => {
    findUnique.mockResolvedValue({
      id: "k1",
      name: "sales-agent",
      revokedAt: null,
      user: USER,
    });
    await expect(authenticateApiKeyDetailed("scl_ok")).resolves.toEqual({
      user: USER,
      keyId: "k1",
      keyName: "sales-agent",
    });
  });

  it("returns null for a revoked key so writes cannot be attributed to it", async () => {
    findUnique.mockResolvedValue({
      id: "k1",
      name: "sales-agent",
      revokedAt: new Date(),
      user: USER,
    });
    await expect(authenticateApiKeyDetailed("scl_ok")).resolves.toBeNull();
  });
});

describe("bearerFromRequest", () => {
  it("reads a Bearer token and ignores other schemes", () => {
    expect(
      bearerFromRequest(new Request("http://x", { headers: { authorization: "Bearer scl_abc" } })),
    ).toBe("scl_abc");
    expect(
      bearerFromRequest(new Request("http://x", { headers: { authorization: "bearer scl_abc" } })),
    ).toBe("scl_abc");
    expect(bearerFromRequest(new Request("http://x", { headers: { authorization: "Basic x" } }))).toBeUndefined();
    expect(bearerFromRequest(new Request("http://x"))).toBeUndefined();
  });
});
