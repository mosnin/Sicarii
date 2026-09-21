// Leftover /api/oauth/authorize still auto-grants a code to a signed-in
// user. Two properties around that grant must not regress:
//   1. PKCE S256 is required. A registered redirect_uri without a challenge
//      (or with the wrong method) is a 302 error to THAT uri — never a code.
//   2. A signed-out visitor is bounced to /sign-in. The registered
//      redirect_uri must not receive a code, and signAuthCode must not run.
//
// Unregistered-redirect 400s are covered elsewhere; this file pins the
// cases that already passed the registration check.

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

const auth = vi.fn(async () => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...args: unknown[]) => auth(...args),
}));

vi.mock("mcp-handler", () => ({
  getPublicOrigin: () => "https://scalar.test",
}));

const getAuthenticatedUser = vi.fn(async () => ({ id: "user-1" }));
vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
}));

const clientRedirectUris = vi.fn();
const signAuthCode = vi.fn(async () => "should-not-mint");
vi.mock("@/lib/oauth", () => ({
  clientRedirectUris: (...args: unknown[]) => clientRedirectUris(...args),
  signAuthCode: (...args: unknown[]) => signAuthCode(...args),
}));

import { GET } from "@/app/api/oauth/authorize/route";

const REDIRECT = "https://client.example.com/callback";

function authorize(params: Record<string, string>) {
  const url = new URL("https://scalar.test/api/oauth/authorize");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url);
}

describe("leftover /api/oauth/authorize PKCE and session gates", () => {
  beforeAll(() => vi.stubEnv("MCP_OAUTH_SECRET", "test-secret"));
  afterAll(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    clientRedirectUris.mockResolvedValue([REDIRECT]);
    auth.mockResolvedValue({ userId: "clerk_1" });
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    signAuthCode.mockResolvedValue("should-not-mint");
  });

  it("redirects a registered client with no PKCE to an error, never a code", async () => {
    const res = await GET(
      authorize({
        client_id: "signed-client",
        redirect_uri: REDIRECT,
        response_type: "code",
        state: "abc",
      }),
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith(`${REDIRECT}?`) || location.startsWith(`${REDIRECT}&`)).toBe(true);
    const dest = new URL(location);
    expect(dest.searchParams.get("error")).toBe("invalid_request");
    expect(dest.searchParams.get("error_description")).toMatch(/PKCE/i);
    expect(dest.searchParams.get("code")).toBeNull();
    expect(dest.searchParams.get("state")).toBe("abc");
    expect(signAuthCode).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it("rejects a plain (non-S256) challenge the same way", async () => {
    const res = await GET(
      authorize({
        client_id: "signed-client",
        redirect_uri: REDIRECT,
        response_type: "code",
        code_challenge: "plain-challenge",
        code_challenge_method: "plain",
      }),
    );
    expect(res.status).toBe(302);
    const dest = new URL(res.headers.get("location") ?? "https://invalid.invalid/");
    expect(dest.searchParams.get("error")).toBe("invalid_request");
    expect(dest.searchParams.get("code")).toBeNull();
    expect(signAuthCode).not.toHaveBeenCalled();
  });

  it("refuses an unsupported response_type without minting a code", async () => {
    const res = await GET(
      authorize({
        client_id: "signed-client",
        redirect_uri: REDIRECT,
        response_type: "token",
        code_challenge: "abc",
        code_challenge_method: "S256",
      }),
    );
    expect(res.status).toBe(302);
    const dest = new URL(res.headers.get("location") ?? "https://invalid.invalid/");
    expect(dest.searchParams.get("error")).toBe("unsupported_response_type");
    expect(dest.searchParams.get("code")).toBeNull();
    expect(signAuthCode).not.toHaveBeenCalled();
  });

  it("bounces a signed-out visitor to /sign-in, not to the client with a code", async () => {
    auth.mockResolvedValue({ userId: null });
    const req = authorize({
      client_id: "signed-client",
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: "abc",
      code_challenge_method: "S256",
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("https://scalar.test/sign-in")).toBe(true);
    const dest = new URL(location);
    expect(dest.searchParams.get("redirect_url")).toBe(req.url);
    expect(location).not.toContain("code=");
    expect(signAuthCode).not.toHaveBeenCalled();
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });
});
