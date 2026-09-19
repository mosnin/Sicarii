#!/usr/bin/env node
// jevcal-style threshold sweep for Scalar noul gates. Reads labeled fixtures
// from fixtures/jevcal/*.json and prints the highest-coverage threshold that
// still holds the target accuracy. Pin those numbers into src/lib/jev/policy.ts
// and set TYPESAFE_JEV_MODEL=jev-1.13.0 once a live sweep has been observed.
//
// Usage:
//   pnpm jevcal
//   node --no-warnings --experimental-strip-types scripts/jevcal.mjs
//   node --no-warnings --experimental-strip-types scripts/jevcal.mjs fixtures/jevcal/identity.json

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { sweepNoulThreshold } from "../src/lib/jev/eval/validate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultDir = path.join(repoRoot, "fixtures", "jevcal");

function loadFixture(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const fixtures = Array.isArray(raw) ? raw : [raw];
  return fixtures.map((f) => {
    if (!f || typeof f !== "object" || typeof f.id !== "string" || !Array.isArray(f.rows)) {
      throw new Error(`Invalid jevcal fixture: ${filePath}`);
    }
    return {
      id: f.id,
      targetAcc: typeof f.targetAcc === "number" ? f.targetAcc : 0.9,
      rows: f.rows.map((r) => ({
        p: Number(r.p),
        gold: Boolean(r.gold),
      })),
    };
  });
}

function collectFiles(argv) {
  if (argv.length > 0) return argv.map((p) => path.resolve(repoRoot, p));
  if (!existsSync(defaultDir)) return [];
  return readdirSync(defaultDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(defaultDir, name));
}

const files = collectFiles(process.argv.slice(2));
if (files.length === 0) {
  console.error("No jevcal fixtures found. Add JSON files under fixtures/jevcal/.");
  process.exit(1);
}

const reports = [];
for (const file of files) {
  for (const fixture of loadFixture(file)) {
    reports.push(sweepNoulThreshold(fixture.id, fixture.rows, fixture.targetAcc));
  }
}

console.log("id\tthreshold\thandled\tacceptedAcc\tallAcc");
for (const r of reports) {
  console.log(
    [
      r.id,
      r.threshold.toFixed(2),
      r.handled.toFixed(2),
      r.acceptedAcc.toFixed(3),
      r.allAcc.toFixed(3),
    ].join("\t"),
  );
}

const pinReady = reports.every((r) => r.handled > 0 && r.acceptedAcc >= 0.9);
if (pinReady) {
  console.log("\nSweep held 0.90 accepted accuracy. Ready to pin jev-1.13.0 after a live run.");
} else {
  console.log("\nSweep did not hold 0.90 accepted accuracy on every id. Do not pin yet.");
}
