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
    expect(AUTO_MODE_TOOLS.has("save_email_context")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("create_variant")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("create_segment")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("create_pipeline")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("enrich_contact")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("find_socials")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("pause_autopilot")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("place_call")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("update_segment")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("delete_segment")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("add_to_pipeline")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("delete_pipeline")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("remember")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("build_smart_segment")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("log_call")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("verify_entity")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("detect_tech")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("remove_segment_member")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("remove_pipeline_entry")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("update_pipeline_entry")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("delete_entity")).toBe(true);
    expect(AUTO_MODE_TOOLS.has("delete_contact")).toBe(true);
    expect(source).toContain("for (const name of AUTO_MODE_TOOLS)");
  });

  it("exposes Field, swarm, and history list tools", () => {
    expect(source).toContain("list_segments:");
    expect(source).toContain("list_pipelines:");
    expect(source).toContain("list_swarm_runs:");
    expect(source).toContain("list_emails:");
    expect(source).toContain("list_activities:");
    expect(source).toContain("list_social_messages:");
    expect(source).toContain("log_outreach:");
    expect(source).toContain("save_email_context:");
    expect(source).toContain("create_variant:");
    expect(source).toContain("get_segment:");
    expect(source).toContain("get_pipeline:");
    expect(source).toContain("create_segment:");
    expect(source).toContain("create_pipeline:");
    expect(source).toContain("enrich_contact:");
    expect(source).toContain("find_socials:");
    expect(source).toContain("pause_autopilot:");
    expect(source).toContain("place_call:");
    expect(source).toContain("pipeline_metrics:");
    expect(source).toContain("get_swarm_run:");
    expect(source).toContain("update_segment:");
    expect(source).toContain("add_to_pipeline:");
    expect(source).toContain("remember:");
    expect(source).toContain("get_provenance:");
    expect(source).toContain("build_smart_segment:");
    expect(source).toContain("sync_call:");
    expect(source).toContain("log_call:");
    expect(source).toContain("verify_entity:");
    expect(source).toContain("detect_tech:");
    expect(source).toContain("remove_segment_member:");
    expect(source).toContain("remove_pipeline_entry:");
    expect(source).toContain("update_pipeline_entry:");
    expect(source).toContain("delete_entity:");
    expect(source).toContain("delete_contact:");
    expect(source).toContain("get_usage:");
  });
});
