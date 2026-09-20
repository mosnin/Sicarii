// Leftover /api/oauth/token (pre-consent JWT codes). The OAuth 2.1 server
// at /oauth/token is covered by tests/oauth-server.test.ts. This route is
// still live for old MCP clients, so a wrong-typ token, a PKCE miss, or a
// swapped redirect_uri must never mint an access token. A regression here
// is a token-swap: an attacker with any signed JWT walks out with MCP
// credentials for the victim.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";

import { signAccessToken, signAuthCode, signClientId } from "@/lib/oauth";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "legacy-token-test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    revokedToken: { create: vi.fn() },
  },
}));

import { POST } from "@/app/api/oauth/token/route";

function form(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request("https://scalar.test/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function mintCode(opts?: { redirectUri?: string; challenge?: string }) {
  const redirectUri = opts?.redirectUri ?? "https://app.example.com/cb";
  const verifier = "legacy-pkce-verifier-value-1234567890";
  const challenge =
    opts?.challenge ?? createHash("sha256").update(verifier).digest("base64url");
  const code = await signAuthCode({
    sub: "user-legacy",
    client_id: "cid-legacy",
    redirect_uri: redirectUri,
    code_challenge: challenge,
    scope: "mcp",
  });
  return { code, verifier, redirectUri };
}

describe("POST /api/oauth/token leftover JWT code grant", () => {
  it("refuses an access token presented as an authorization code (typ confusion)", async () => {
    const access = await signAccessToken("user-legacy", "mcp");
    const res = await POST(
      form({
        grant_type: "authorization_code",
        code: access,
        redirect_uri: "https://app.example.com/cb",
        code_verifier: "anything-long-enough",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_grant");
  });

  it("refuses a signed client_id presented as a code", async () => {
    const clientId = await signClientId(["https://app.example.com/cb"]);
    const res = await POST(
      form({
        grant_type: "authorization_code",
        code: clientId,
        redirect_uri: "https://app.example.com/cb",
        code_verifier: "anything-long-enough",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_grant");
  });

  it("refuses a PKCE miss and does not return tokens", async () => {
    const { code, redirectUri } = await mintCode();
    const res = await POST(
      form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: "wrong-verifier-value",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; access_token?: string };
    expect(body.error).toBe("invalid_grant");
    expect(body.access_token).toBeUndefined();
  });

  it("refuses a redirect_uri that does not match the code binding", async () => {
    const { code, verifier } = await mintCode({
      redirectUri: "https://app.example.com/cb",
    });
    const res = await POST(
      form({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://evil.example/steal",
        code_verifier: verifier,
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; access_token?: string };
    expect(body.error).toBe("invalid_grant");
    expect(body.access_token).toBeUndefined();
  });

  it("refuses a missing code, redirect_uri, or verifier", async () => {
    const { code, verifier, redirectUri } = await mintCode();
    const missingCode = await POST(
      form({
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    );
    const missingRedirect = await POST(
      form({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
      }),
    );
    const missingVerifier = await POST(
      form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    );
    expect(missingCode.status).toBe(400);
    expect(missingRedirect.status).toBe(400);
    expect(missingVerifier.status).toBe(400);
  });

  it("refuses an unsupported grant_type", async () => {
    const res = await POST(form({ grant_type: "password", username: "x", password: "y" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("unsupported_grant_type");
  });

  it("mints tokens when PKCE and redirect_uri match", async () => {
    const { code, verifier, redirectUri } = await mintCode();
    const res = await POST(
      form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
    };
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
  });
});
