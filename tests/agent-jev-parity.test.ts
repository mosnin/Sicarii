// Source pins for in-app agent Jev parity: getters stay slim, and paid
// search tools stay in AUTO_MODE_TOOLS so a future edit cannot silently
// drop the MCP-matching spend gate.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { AUTO_MODE_TOOLS } from "@/lib/jev";

const agentPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "app",
  "api",
  "agent",
  "route.ts",
);
const source = readFileSync(agentPath, "utf8");

describe("agent Jev parity", () => {
  it("omits enrichment on get_entity and get_contact", () => {
    expect(source).toContain("getEntity(userId, id, { includeEnrichment: false })");
    expect(source).toContain("includeChannelHistory: false");
  });

  it("keeps paid search tools in auto-mode", () => {
    expect(AUTO_MODE_TOOLS.has("search_web")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("google_search")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("add_activity")).toBe(true);
    expect(source).toContain("for (const name of AUTO_MODE_TOOLS)");
  });

  it("exposes Field, swarm, and history list tools", () => {
    expect(source).toContain("list_segments:");
    expect(source).toContain("list_pipelines:");
    expect(source).toContain("list_swarm_runs:");
    expect(source).toContain("list_emails:");
    expect(source).toContain("list_activities:");
    expect(source).toContain("log_outreach:");
  });
});
