// Source-inspection: workspace OAuth must bind the authorizing human and
// re-check TeamMember on token grant, refresh, and MCP auth. A missing check
// at any one of those three sites is enough for a removed member to keep
// full CRM access for the 30-day refresh lifetime.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("OAuth tokens bind and re-check the authorizing human", () => {
  it("authorize stamps the Clerk actor onto the auth code", () => {
    const src = read("src/app/api/oauth/authorize/route.ts");
    expect(src).toContain("getAuthContext");
    expect(src).toContain("act: ctx.actor.id");
    expect(src).toContain("sub: ctx.account.id");
  });

  it("token grant and refresh refuse a removed actor", () => {
    const src = read("src/app/api/oauth/token/route.ts");
    expect(src).toContain("oauthActorStillAuthorized");
    expect(src).toContain("identityFromClaims");
    expect(src).toContain("signAccessToken(identity.userId, claims.scope, identity.actorId)");
    expect(src).toContain("signRefreshToken(identity.userId, claims.scope, identity.actorId)");
    const grantChecks = src.split("oauthActorStillAuthorized").length - 1;
    expect(grantChecks).toBeGreaterThanOrEqual(2);
  });

  it("MCP auth re-checks membership before injecting workspace userId", () => {
    const src = read("src/app/api/mcp/[transport]/route.ts");
    expect(src).toContain("identityFromAccessToken");
    expect(src).toContain("oauthActorStillAuthorized");
    expect(src).not.toContain("userIdFromAccessToken");
  });
});
