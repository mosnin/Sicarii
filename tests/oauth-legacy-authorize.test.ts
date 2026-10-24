// The leftover /api/oauth/authorize must never mint a code. A crafted link
// used to auto-approve for any signed-in victim; it now hands the request
// to /oauth/authorize, which shows the consent screen.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "test-secret");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

vi.mock("mcp-handler", () => ({
  getPublicOrigin: () => "https://scalar.test",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: true })),
}));

import { GET } from "@/app/api/oauth/authorize/route";
import { POST as register } from "@/app/api/oauth/register/route";

describe("GET /api/oauth/authorize", () => {
  it("redirects to /oauth/authorize with the original query intact", async () => {
    const req = new Request(
      "https://scalar.test/api/oauth/authorize?client_id=cid&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&response_type=code&code_challenge=abc&code_challenge_method=S256&state=s1",
    );
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const dest = new URL(location!);
    expect(dest.origin).toBe("https://scalar.test");
    expect(dest.pathname).toBe("/oauth/authorize");
    expect(dest.searchParams.get("client_id")).toBe("cid");
    expect(dest.searchParams.get("redirect_uri")).toBe("https://evil.example/cb");
    expect(dest.searchParams.get("response_type")).toBe("code");
    expect(dest.searchParams.get("code_challenge")).toBe("abc");
    expect(dest.searchParams.get("code_challenge_method")).toBe("S256");
    expect(dest.searchParams.get("state")).toBe("s1");
  });

  it("does not put an authorization code on the redirect", async () => {
    const req = new Request(
      "https://scalar.test/api/oauth/authorize?client_id=cid&redirect_uri=https://app.example.com/cb",
    );
    const res = await GET(req);
    const dest = new URL(res.headers.get("location")!);
    expect(dest.searchParams.has("code")).toBe(false);
    expect(dest.pathname).toBe("/oauth/authorize");
  });
});

describe("POST /api/oauth/register", () => {
  it("rejects a non-https, non-loopback redirect_uri", async () => {
    const res = await register(
      new Request("https://scalar.test/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("accepts https and loopback redirect_uris", async () => {
    const res = await register(
      new Request("https://scalar.test/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://app.example.com/cb", "http://localhost:8787/cb"],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { redirect_uris?: string[]; client_id?: string };
    expect(body.redirect_uris).toEqual([
      "https://app.example.com/cb",
      "http://localhost:8787/cb",
    ]);
    expect(body.client_id).toBeTruthy();
  });
});
