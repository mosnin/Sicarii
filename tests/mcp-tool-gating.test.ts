// Regression pin for the 2026-07-11 MCP audit's Gap A ("write tools with no
// rate limit") and Gap B ("tools missing annotations").
//
// The MCP route (src/app/api/mcp/[transport]/route.ts) pulls in Prisma,
// Stripe/x402, OpenAI embeddings, and several other clients that make it
// impractical to import the live handler and exercise server.tool() calls in
// a unit test without an elaborate mock of mcp-handler's McpServer. Instead
// this test works at the source level: it parses out each server.tool(...)
// registration block and asserts, per tool, that write/mutating tools call
// gated(...) (never a bare run()) and that every registration carries an
// annotations object. This is exactly the property the audit flagged, so a
// regression (someone reverting a tool to bare run(), or adding a new write
// tool without gating/annotations) fails loudly here instead of shipping.

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

// Every server.tool("name", ...) registration, with the source slice from
// that call up to the next registration (or end of the server callback).
function toolBlocks(src: string): Map<string, string> {
  const starts: { name: string; index: number }[] = [];
  const re = /server\.tool\(\s*\n\s*"([a-z_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    starts.push({ name: m[1], index: m.index });
  }
  const blocks = new Map<string, string>();
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    blocks.set(starts[i].name, src.slice(starts[i].index, end));
  }
  return blocks;
}

const blocks = toolBlocks(source);

// Tools that write/mutate CRM state or spam-able external side effects. Per
// the audit, every one of these must run its handler through gated(), never
// the un-limited run(). (Read-only list_*/get_*/search_crm/pipeline_metrics
// and tools already gated before this pass are intentionally excluded.)
const mustBeGated = [
  "update_entity",
  "delete_entity",
  "update_contact",
  "delete_contact",
  "save_email_context",
  "log_social_message",
  "create_segment",
  "build_smart_segment",
  "create_pipeline",
  "add_to_pipeline",
  "update_pipeline_entry",
  "remember",
  // recall reads only the user's own memory (0 credits) but still embeds the
  // query via OpenAI, so it is rate-limited via gated() to bound flooding.
  "recall",
  "sync_call",
  "log_call",
  "log_outreach",
  "add_activity",
  // Already gated before this pass - pinning them guards against a future
  // regression back to bare run() just as much as the newly-gated ones.
  "create_entity",
  "create_contact",
  "enrich_entity",
  "enrich_contact",
  "find_socials",
  "search_web",
  "find_companies",
  "maps_leads",
  "extract_contact_details",
  "google_search",
  "buy_credits",
  "buy_plan",
  "verify_entity",
  "detect_tech",
  "place_call",
];

describe("MCP route: write tools are rate-limited", () => {
  it("found every expected tool registration in the route source", () => {
    for (const name of mustBeGated) {
      expect(blocks.has(name), `tool "${name}" not found in route.ts`).toBe(true);
    }
  });

  for (const name of mustBeGated) {
    it(`${name} calls gated(), not a bare run()`, () => {
      const block = blocks.get(name)!;
      expect(block, `missing block for ${name}`).toBeTruthy();
      expect(block.includes("gated(extra,"), `${name} should call gated(extra, ...)`).toBe(true);
    });
  }
});

// Read-only tools should stay on run() - gated() would just waste a rate-limit
// bucket on traffic that costs nothing and can't be spammed for effect. This
// pins them so a future edit doesn't silently start throttling reads too.
const readOnlyTools = [
  "list_entities",
  "get_entity",
  "list_contacts",
  "get_contact",
  "list_social_messages",
  "search_crm",
  "list_segments",
  "get_segment",
  "list_pipelines",
  "get_pipeline",
  "pipeline_metrics",
  "get_balance",
  "get_usage",
  "list_contact_calls",
  "list_due_followups",
  "list_activities",
];

describe("MCP route: read-only tools stay ungated", () => {
  for (const name of readOnlyTools) {
    it(`${name} does not call gated()`, () => {
      const block = blocks.get(name);
      expect(block, `missing block for ${name}`).toBeTruthy();
      expect(block!.includes("gated(extra,"), `${name} should not call gated()`).toBe(false);
    });
  }
});

// Every tool registration must carry the MCP annotations object
// ({ readOnlyHint, destructiveHint, idempotentHint, openWorldHint }) as its
// 4th argument. Before this pass, ~21 of the original CRUD/segment/pipeline
// tools shipped with none at all.
describe("MCP route: every tool carries annotations", () => {
  for (const name of [...mustBeGated, ...readOnlyTools]) {
    it(`${name} has a readOnlyHint annotation before its handler`, () => {
      const block = blocks.get(name)!;
      // The annotation object must appear before the "async (" handler arrow,
      // i.e. it's the 4th server.tool() argument, not something incidental
      // inside the handler body.
      const annotationIndex = block.indexOf("readOnlyHint");
      const handlerIndex = block.search(/async\s*\(/);
      expect(annotationIndex, `${name} is missing a readOnlyHint annotation`).toBeGreaterThan(-1);
      expect(handlerIndex, `${name} handler arrow not found`).toBeGreaterThan(-1);
      expect(annotationIndex < handlerIndex, `${name} annotation must precede its handler`).toBe(true);
    });
  }
});
