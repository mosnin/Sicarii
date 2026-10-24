// MCP auth (src/app/api/mcp/[transport]/route.ts) accepts three bearer
// shapes. The OAuth 2.1 path must require the `mcp` scope: a token minted
// for userinfo / crm:read only must never become an MCP session. The handler
// is coupled to mcp-handler's withMcpAuth, so this pins the source-level
// property the same way tests/mcp-tool-gating.test.ts pins gated().
//
// A regression here is an audience bypass: any /oauth/* access token, even
// one the user thought was profile-only, would operate the CRM.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const routePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "app",
  "api",
  "mcp",
  "[transport]",
  "route.ts",
);
const source = readFileSync(routePath, "utf8");

describe("MCP route: OAuth 2.1 tokens require the mcp scope", () => {
  it("resolves OAuth access tokens only when the grant includes mcp", () => {
    expect(source).toContain("authenticateOauthAccessToken");
    expect(source).toMatch(/granted\s*&&\s*granted\.scopes\.includes\(\s*["']mcp["']\s*\)/);
  });

  it("tries the per-user API key before the OAuth tables, so scl_ traffic never hashes as an OAuth token", () => {
    const keyIdx = source.indexOf("authenticateApiKeyDetailed");
    const oauthIdx = source.indexOf("authenticateOauthAccessToken");
    expect(keyIdx).toBeGreaterThan(-1);
    expect(oauthIdx).toBeGreaterThan(-1);
    expect(keyIdx).toBeLessThan(oauthIdx);
  });
});
