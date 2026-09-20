// Research schedules debit deep_research and write notes onto a targeted
// CRM row. Two properties must not regress:
//   1. spendCredits runs before the provider call (a failed lookup still
//      costs, but we never run Linkup/Exa for free when the meter is empty).
//   2. targeted updates are scoped by userId, so a schedule cannot overwrite
//      another tenant's notes.
//
// The handler pulls Inngest + providers, so this pins the source the same
// way tests/mcp-tool-gating.test.ts pins gated().

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "inngest", "functions.ts"),
  "utf8",
);

const start = source.indexOf("id: \"run-research-schedules\"");
const end = source.indexOf("id: \"run-autopilot-plans\"");
const block = start >= 0 && end > start ? source.slice(start, end) : "";

describe("run-research-schedules safety pins", () => {
  it("is present as its own Inngest function", () => {
    expect(block.length).toBeGreaterThan(200);
  });

  it("debits deep_research before any Linkup or Exa call", () => {
    const debitAt = block.indexOf('spendCredits(schedule.userId, "deep_research"');
    const linkupAt = block.indexOf("linkupDeepResearch");
    const exaAt = block.indexOf("exaIntentSearch");
    expect(debitAt).toBeGreaterThan(-1);
    expect(linkupAt).toBeGreaterThan(-1);
    expect(exaAt).toBeGreaterThan(-1);
    expect(debitAt).toBeLessThan(linkupAt);
    expect(debitAt).toBeLessThan(exaAt);
  });

  it("scopes targeted entity and contact writes to the schedule owner", () => {
    expect(block).toMatch(
      /entity\.updateMany\(\s*\{\s*where:\s*\{\s*id:\s*schedule\.targetId,\s*userId:\s*schedule\.userId/,
    );
    expect(block).toMatch(
      /contact\.updateMany\(\s*\{\s*where:\s*\{\s*id:\s*schedule\.targetId,\s*userId:\s*schedule\.userId/,
    );
  });

  it("honors the creation budget before inserting untargeted entities", () => {
    expect(block).toContain("checkCreationBudget(schedule.userId)");
  });
});
