// Refresh-token rotation with reuse detection. A stolen refresh token must be
// caught the moment the legitimate client rotates past it. These tests prove:
//   1. A fresh refresh token consumes successfully (returns claims).
//   2. Presenting the SAME token again is rejected (reuse => null).

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

import { signRefreshToken, consumeRefreshToken, signAccessToken } from "@/lib/oauth";

beforeAll(() => vi.stubEnv("MCP_OAUTH_SECRET", "rotation-test-secret"));
afterAll(() => vi.unstubAllEnvs());

describe("refresh token rotation", () => {
  it("consumes a fresh refresh token once, then rejects reuse", async () => {
    const rt = await signRefreshToken("user-1", "mcp");

    const first = await consumeRefreshToken(rt);
    expect(first?.sub).toBe("user-1");

    // Replaying the exact same token (same jti) is reuse => rejected.
    const second = await consumeRefreshToken(rt);
    expect(second).toBeNull();
  });

  it("rejects an access token presented as a refresh token (typ confusion)", async () => {
    const access = await signAccessToken("user-2", "mcp");
    expect(await consumeRefreshToken(access)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await consumeRefreshToken("not-a-jwt")).toBeNull();
  });
});
