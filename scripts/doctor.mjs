#!/usr/bin/env node
// Environment doctor: one command that reports exactly what's configured and
// what's missing across every optional-but-load-bearing integration, so
// closing the Reality Gate doesn't require guessing which of ~15 env vars is
// missing by reading scattered code and logs.
//
// Usage:
//   node scripts/doctor.mjs            # reads .env.local (if present) + process.env
//   pnpm doctor
//
// This runs standalone via plain `node`, not through Next.js, so it does its
// own tiny .env.local parsing below (Next.js normally does this for you).
// The actual check logic lives in src/lib/env-doctor.ts and is imported
// directly - Node's built-in TypeScript support loads that file straight up
// since it only uses erasable syntax and a plain relative import path (no
// "@/..." alias, which only webpack/Next understands).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runEnvDoctor, formatDoctorReport } from "../src/lib/env-doctor.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** Tiny .env parser: KEY=value per line, '#' comments, optional quotes. No deps. */
function parseEnvFile(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const parsed = parseEnvFile(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    // Real process.env / platform env vars always win over .env.local.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

const report = runEnvDoctor(process.env);
console.log(formatDoctorReport(report));

// Non-zero exit when anything is missing/partial makes this usable as a CI
// gate later, without forcing that today (deploys can still proceed with
// optional integrations off).
process.exitCode = report.summary.missing > 0 || report.summary.partial > 0 ? 1 : 0;
