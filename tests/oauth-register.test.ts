// Dynamic Client Registration is public and unauthenticated. These tests pin
// the two bounds that keep it from becoming an open-redirect factory: a
// per-IP rate limit, and a hard cap on how many redirect_uris one client
// can bind into the signed client_id.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

import { POST } from "@/app/api/oauth/register/route";
import { clientRedirectUris } from "@/lib/oauth";

beforeAll(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "register-route-test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ success: true, remaining: 19, resetAt: Date.now() + 60_000 });
});

function req(body: unknown, ip = "203.0.113.9") {
  return new Request("https://scalar.test/api/oauth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/oauth/register", () => {
  it("rate-limits by client IP and never signs a client_id when capped", async () => {
    checkRateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const res = await POST(req({ redirect_uris: ["https://app.example.com/cb"] }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(checkRateLimit).toHaveBeenCalledWith(
      "oauth-register:203.0.113.9",
      20,
      60 * 60_000,
    );
  });

  it("caps redirect_uris at 10 and binds exactly those into the signed client_id", async () => {
    const uris = Array.from({ length: 12 }, (_, i) => `https://app.example.com/cb/${i}`);
    const res = await POST(req({ redirect_uris: uris, client_name: "Overstuffed" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { client_id: string; redirect_uris: string[] };
    expect(body.redirect_uris).toHaveLength(10);
    expect(body.redirect_uris).toEqual(uris.slice(0, 10));
    expect(await clientRedirectUris(body.client_id)).toEqual(uris.slice(0, 10));
  });

  it("drops non-string redirect_uris so they cannot be smuggled into the JWT", async () => {
    const res = await POST(
      req({
        redirect_uris: ["https://app.example.com/cb", 12, { url: "https://evil.test" }, null],
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { client_id: string; redirect_uris: string[] };
    expect(body.redirect_uris).toEqual(["https://app.example.com/cb"]);
    expect(await clientRedirectUris(body.client_id)).toEqual(["https://app.example.com/cb"]);
  });
});
