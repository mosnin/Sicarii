// OAuth token helpers: signed client_id round-trip, typ confusion guards, and
// the PKCE S256 check. These close the open-redirect and token-swap holes, so
// they must never regress.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";

import {
  signClientId,
  clientRedirectUris,
  verifyPkceS256,
  signAccessToken,
  signRefreshToken,
  userIdFromAccessToken,
  identityFromAccessToken,
  identityFromClaims,
} from "@/lib/oauth";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("signed client_id", () => {
  it("round-trips the redirect_uris through signClientId and clientRedirectUris", async () => {
    const uris = ["https://app.example.com/callback", "http://localhost:3000/cb"];
    const clientId = await signClientId(uris);
    expect(typeof clientId).toBe("string");
    const out = await clientRedirectUris(clientId);
    expect(out).toEqual(uris);
  });

  it("returns null for a random string", async () => {
    expect(await clientRedirectUris("not-a-jwt-at-all")).toBeNull();
    expect(await clientRedirectUris("")).toBeNull();
  });

  it("returns null for a token signed with a different typ (typ confusion guard)", async () => {
    const accessToken = await signAccessToken("user_123");
    expect(await clientRedirectUris(accessToken)).toBeNull();
  });
});

describe("userIdFromAccessToken", () => {
  it("returns the sub for a valid access token", async () => {
    const token = await signAccessToken("user_abc");
    expect(await userIdFromAccessToken(token)).toBe("user_abc");
  });

  it("still returns the account sub when an actor is bound", async () => {
    const token = await signAccessToken("ws_1", "mcp", "human_1");
    expect(await userIdFromAccessToken(token)).toBe("ws_1");
  });

  it("returns null for a client_id token (typ confusion guard)", async () => {
    const clientId = await signClientId(["https://app.example.com/callback"]);
    expect(await userIdFromAccessToken(clientId)).toBeNull();
  });

  it("returns null for garbage", async () => {
    expect(await userIdFromAccessToken("garbage")).toBeNull();
  });
});

describe("identityFromAccessToken", () => {
  it("returns only userId for a legacy token with no actor", async () => {
    const token = await signAccessToken("user_abc");
    expect(await identityFromAccessToken(token)).toEqual({ userId: "user_abc" });
  });

  it("round-trips the authorizing human as act", async () => {
    const token = await signAccessToken("ws_1", "mcp", "human_1");
    expect(await identityFromAccessToken(token)).toEqual({
      userId: "ws_1",
      actorId: "human_1",
    });
  });

  it("returns null for a refresh token (typ confusion guard)", async () => {
    const refresh = await signRefreshToken("ws_1", "mcp", "human_1");
    expect(await identityFromAccessToken(refresh)).toBeNull();
  });
});

describe("identityFromClaims", () => {
  it("reads act when present", () => {
    expect(identityFromClaims({ sub: "ws_1", act: "human_1" })).toEqual({
      userId: "ws_1",
      actorId: "human_1",
    });
  });

  it("omits actorId when act is missing", () => {
    expect(identityFromClaims({ sub: "user_1" })).toEqual({ userId: "user_1" });
  });

  it("returns null without a string sub", () => {
    expect(identityFromClaims({ act: "human_1" })).toBeNull();
  });
});

describe("verifyPkceS256", () => {
  it("passes for a correct verifier and challenge pair", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("fails for a wrong verifier", () => {
    const verifier = "correct-verifier-value-1234567890";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256("wrong-verifier-value", challenge)).toBe(false);
  });

  it("fails when the challenge is the raw verifier (plain, not S256)", () => {
    const verifier = "some-verifier-value";
    expect(verifyPkceS256(verifier, verifier)).toBe(false);
  });
});
