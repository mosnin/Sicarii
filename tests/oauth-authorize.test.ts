// OAuth authorize endpoint: a crafted redirect_uri must never receive a live
// auth code. Registration is checked BEFORE any 302, so an unregistered URL
// is a plain 400 — not an open redirect into code phishing.

import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

const getAuthenticatedUserMock = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
  getAuthContext: vi.fn(),
}));

vi.mock("mcp-handler", () => ({
  getPublicOrigin: () => "https://scalar.test",
}));

import { GET } from "@/app/api/oauth/authorize/route";
import { signClientId } from "@/lib/oauth";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "authorize-route-test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  authMock.mockReset();
  getAuthenticatedUserMock.mockReset();
});

function authorizeUrl(params: Record<string, string>) {
  const url = new URL("https://scalar.test/api/oauth/authorize");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url);
}

async function registeredClient(redirectUri = "https://app.example.com/callback") {
  const clientId = await signClientId([redirectUri]);
  return { clientId, redirectUri };
}

describe("GET /api/oauth/authorize — redirect_uri gate", () => {
  it("400s a missing redirect_uri and never redirects", async () => {
    const res = await GET(authorizeUrl({ client_id: "x", response_type: "code" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  it("400s a malformed redirect_uri and never redirects", async () => {
    const res = await GET(
      authorizeUrl({ redirect_uri: "not a url", client_id: "x", response_type: "code" }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  it("400s an unregistered redirect_uri even when the user is signed in", async () => {
    authMock.mockResolvedValue({ userId: "clerk_1" });
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-ada" });
    const { clientId } = await registeredClient("https://app.example.com/callback");

    const res = await GET(
      authorizeUrl({
        client_id: clientId,
        redirect_uri: "https://attacker.example/steal",
        response_type: "code",
        code_challenge: "abc",
        code_challenge_method: "S256",
      }),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(getAuthenticatedUserMock).not.toHaveBeenCalled();
  });

  it("400s when client_id is not a signed registration", async () => {
    const res = await GET(
      authorizeUrl({
        client_id: "random-string",
        redirect_uri: "https://app.example.com/callback",
        response_type: "code",
        code_challenge: "abc",
        code_challenge_method: "S256",
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("GET /api/oauth/authorize — registered client", () => {
  it("sends a signed-out user to /sign-in instead of issuing a code", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { clientId, redirectUri } = await registeredClient();
    const challenge = createHash("sha256").update("verifier-value").digest("base64url");

    const res = await GET(
      authorizeUrl({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "abc123",
      }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("https://scalar.test/sign-in")).toBe(true);
    expect(location).not.toContain("code=");
    expect(getAuthenticatedUserMock).not.toHaveBeenCalled();
  });

  it("redirects a PKCE error to the registered URI, never to a stranger", async () => {
    authMock.mockResolvedValue({ userId: "clerk_1" });
    const { clientId, redirectUri } = await registeredClient();

    const res = await GET(
      authorizeUrl({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: "plain-not-s256",
        code_challenge_method: "plain",
      }),
    );

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.has("code")).toBe(false);
  });

  it("issues a code to the registered redirect_uri for a signed-in PKCE request", async () => {
    authMock.mockResolvedValue({ userId: "clerk_1" });
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-ada" });
    const { clientId, redirectUri } = await registeredClient();
    const challenge = createHash("sha256").update("verifier-value").digest("base64url");

    const res = await GET(
      authorizeUrl({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "abc123",
      }),
    );

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(location.searchParams.get("state")).toBe("abc123");
  });
});
