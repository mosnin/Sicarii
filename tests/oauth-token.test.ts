// OAuth token endpoint: a leaked or swapped code must never mint tokens.
// These tests pin the grant checks that sit in front of signAccessToken —
// redirect_uri exact match, PKCE S256, typ confusion, and refresh reuse.

import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/prisma", () => {
  const consumed = new Set<string>();
  return {
    prisma: {
      revokedToken: {
        create: vi.fn(async ({ data }: { data: { jti: string } }) => {
          if (consumed.has(data.jti)) {
            const err = new Error("Unique constraint failed") as Error & { code: string };
            err.code = "P2002";
            throw err;
          }
          consumed.add(data.jti);
          return data;
        }),
      },
    },
  };
});

import { POST } from "@/app/api/oauth/token/route";
import { signAuthCode, signAccessToken, signRefreshToken } from "@/lib/oauth";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "token-route-test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function formReq(body: Record<string, string>) {
  return new Request("https://scalar.test/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

async function mintCode(opts?: { redirectUri?: string; verifier?: string }) {
  const verifier = opts?.verifier ?? "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const redirectUri = opts?.redirectUri ?? "https://app.example.com/callback";
  const code_challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = await signAuthCode({
    sub: "user-ada",
    client_id: "client-1",
    redirect_uri: redirectUri,
    code_challenge,
    scope: "mcp",
  });
  return { code, verifier, redirectUri };
}

describe("POST /api/oauth/token — authorization_code", () => {
  it("mints access + refresh tokens for a valid PKCE exchange", async () => {
    const { code, verifier, redirectUri } = await mintCode();
    const res = await POST(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    };
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.access_token.length).toBeGreaterThan(20);
    expect(body.refresh_token.length).toBeGreaterThan(20);
  });

  it("rejects a redirect_uri that does not exactly match the code", async () => {
    const { code, verifier, redirectUri } = await mintCode();
    const res = await POST(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${redirectUri}/extra`,
        code_verifier: verifier,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_grant",
      error_description: "redirect_uri mismatch",
    });
  });

  it("rejects a wrong PKCE verifier", async () => {
    const { code, redirectUri } = await mintCode();
    const res = await POST(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: "wrong-verifier-value-not-the-original",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_grant",
      error_description: "PKCE verification failed",
    });
  });

  it("rejects an access token presented as an authorization code (typ confusion)", async () => {
    const access = await signAccessToken("user-ada", "mcp");
    const res = await POST(
      formReq({
        grant_type: "authorization_code",
        code: access,
        redirect_uri: "https://app.example.com/callback",
        code_verifier: "any-verifier-at-least-twenty-chars",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_grant",
      error_description: "Bad or expired code",
    });
  });

  it("rejects a missing code, redirect_uri, or verifier", async () => {
    const res = await POST(formReq({ grant_type: "authorization_code", code: "x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });
});

describe("POST /api/oauth/token — refresh_token", () => {
  it("rotates once, then rejects reuse of the same refresh token", async () => {
    const rt = await signRefreshToken("user-ada", "mcp");
    const first = await POST(formReq({ grant_type: "refresh_token", refresh_token: rt }));
    expect(first.status).toBe(200);
    const minted = (await first.json()) as { access_token: string; refresh_token: string };
    expect(minted.access_token).toBeTruthy();
    expect(minted.refresh_token).not.toBe(rt);

    const replay = await POST(formReq({ grant_type: "refresh_token", refresh_token: rt }));
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("rejects a missing refresh_token", async () => {
    const res = await POST(formReq({ grant_type: "refresh_token" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });
});

describe("POST /api/oauth/token — grant_type", () => {
  it("rejects an unsupported grant", async () => {
    const res = await POST(formReq({ grant_type: "password", username: "a", password: "b" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_grant_type" });
  });
});
