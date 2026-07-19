// Approval gating: an agent (holding only an API key) must never be able to
// approve its own autopilot plan - only a human, from a Clerk session. There
// is no MCP tool for approval at all (grepped below), and the REST route only
// resolves the caller via getAuthenticatedUser(), which src/lib/auth-utils.ts
// implements strictly from the Clerk session cookie (auth() from
// @clerk/nextjs/server) with NO Authorization: Bearer / API-key fallback -
// unlike resolveRequestUser(), which routes like x402 payments use
// specifically because BOTH humans and agents may call them. Mirrors the
// source-inspection style of the "does not debit credits before..." test in
// tests/credits.test.ts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("autopilot approval is human-only", () => {
  it("the approve route resolves the caller ONLY via the session-gated helper, never a bearer/API-key path", () => {
    const route = read("src/app/api/autopilot-plans/[id]/approve/route.ts");
    expect(route).toContain("getAuthenticatedUser");
    expect(route).not.toContain("resolveRequestUser");
    expect(route).not.toContain("authenticateApiKey");
    expect(route).not.toContain("bearerFromRequest");
  });

  it("getAuthenticatedUser itself has no Authorization/Bearer fallback (it is Clerk-session-only)", () => {
    const authUtils = read("src/lib/auth-utils.ts");
    // getAuthContext (which getAuthenticatedUser wraps) must resolve strictly
    // from auth() (the Clerk session). If a bearer/API-key path were ever
    // added to this helper, every route built on it - including approve -
    // would silently become agent-callable. Guard the invariant at its
    // source: isolate just the getAuthContext function body (up to the next
    // top-level export) and assert it never reaches for a bearer token.
    const start = authUtils.indexOf("export async function getAuthContext");
    expect(start).toBeGreaterThan(-1);
    const rest = authUtils.slice(start + 1);
    const nextExport = rest.search(/\nexport (async )?function /);
    const authContextBody = nextExport === -1 ? rest : rest.slice(0, nextExport);

    expect(authContextBody).toContain("auth()");
    expect(authContextBody).not.toContain("bearerFromRequest");
    expect(authContextBody).not.toContain("authenticateApiKey");

    // resolveRequestUser (the human-OR-agent hybrid used by x402 routes) is a
    // deliberately DIFFERENT function - confirm approve does not use it.
    expect(authUtils).toContain("export async function resolveRequestUser");
  });

  it("there is no MCP tool that can approve a plan - only propose/status/pause are exposed", () => {
    const mcpRoute = read("src/app/api/mcp/[transport]/route.ts");
    expect(mcpRoute).toContain('"propose_autopilot_plan"');
    expect(mcpRoute).toContain('"get_autopilot_status"');
    expect(mcpRoute).toContain('"pause_autopilot"');
    expect(mcpRoute).not.toContain("approveAutopilotPlan");
    expect(mcpRoute).not.toContain('"approve_autopilot');
  });

  it("the in-app agent also has no approve tool - only propose/status", () => {
    const agentRoute = read("src/app/api/agent/route.ts");
    expect(agentRoute).toContain("propose_autopilot_plan");
    expect(agentRoute).toContain("get_autopilot_status");
    expect(agentRoute).not.toContain("approveAutopilotPlan");
  });

  it("proposeAutopilotPlan always creates a draft - callers cannot pass an initial status", async () => {
    const src = read("src/lib/autopilot-operations.ts");
    const fnBody = src.slice(
      src.indexOf("export async function proposeAutopilotPlan"),
      src.indexOf("/* -------------------------------- Reads"),
    );
    expect(fnBody).toContain('status: "draft"');
  });
});
