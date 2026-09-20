// Leftover /api/oauth/authorize must never ship an authorization code to a
// URL that is not bound into the signed client_id. That is the open-redirect
// / code-phishing hole: a crafted link would bounce a signed-in victim to
// an attacker-controlled callback with a live code.
//
// Durable across the leftover-route rewrite that hands the request to
// /oauth/authorize: a 400 is fine, a same-origin redirect with no code is
// fine. A 302 whose Location is the unregistered redirect_uri (with or
// without a code) is the regression.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "legacy-authorize-test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

vi.mock("mcp-handler", () => ({
  getPublicOrigin: () => "https://scalar.test",
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUser: vi.fn(async () => {
    throw new Error("authorize must not resolve a user before the redirect_uri is trusted");
  }),
}));

import { GET } from "@/app/api/oauth/authorize/route";
import { signClientId } from "@/lib/oauth";

function locationOf(res: Response): URL | null {
  const raw = res.headers.get("location");
  if (!raw) return null;
  return new URL(raw, "https://scalar.test");
}

describe("GET /api/oauth/authorize leftover open-redirect guard", () => {
  it("never 302s the browser to an unregistered redirect_uri", async () => {
    const res = await GET(
      new Request(
        "https://scalar.test/api/oauth/authorize?client_id=not-a-signed-client&redirect_uri=https%3A%2F%2Fevil.example%2Fsteal&response_type=code&code_challenge=abc&code_challenge_method=S256&state=s1",
      ),
    );

    if (res.status === 302) {
      const dest = locationOf(res);
      expect(dest).toBeTruthy();
      expect(dest!.host).not.toBe("evil.example");
      expect(dest!.searchParams.has("code")).toBe(false);
    } else {
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("never 302s to a registered client's URI when a different URI is supplied", async () => {
    const clientId = await signClientId(["https://app.example.com/cb"]);
    const res = await GET(
      new Request(
        `https://scalar.test/api/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=https%3A%2F%2Fevil.example%2Fsteal&response_type=code&code_challenge=abc&code_challenge_method=S256`,
      ),
    );

    if (res.status === 302) {
      const dest = locationOf(res);
      expect(dest).toBeTruthy();
      expect(dest!.host).not.toBe("evil.example");
      expect(dest!.searchParams.has("code")).toBe(false);
    } else {
      expect(res.status).toBe(400);
    }
  });

  it("rejects a missing or non-URL redirect_uri without redirecting", async () => {
    const missing = await GET(
      new Request(
        "https://scalar.test/api/oauth/authorize?client_id=cid&response_type=code",
      ),
    );
    const garbage = await GET(
      new Request(
        "https://scalar.test/api/oauth/authorize?client_id=cid&redirect_uri=not-a-url&response_type=code",
      ),
    );

    for (const res of [missing, garbage]) {
      if (res.status === 302) {
        const dest = locationOf(res);
        expect(dest).toBeTruthy();
        expect(dest!.pathname).toBe("/oauth/authorize");
        expect(dest!.searchParams.has("code")).toBe(false);
      } else {
        expect(res.status).toBe(400);
      }
    }
  });
});
