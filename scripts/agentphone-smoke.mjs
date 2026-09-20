#!/usr/bin/env node
// AgentPhone smoke test: verify a real API key against the live AgentPhone
// API without placing an actual phone call. Companion to src/lib/agentphone.ts
// (see the doc comment there) - the parsing in that file is defensive and
// degrades gracefully on an unexpected shape, but this script is the way to
// find out, once, what the live API actually returns, so we can tighten the
// field names it looks for.
//
// Usage:
//   AGENTPHONE_API_KEY=sk_live_... node scripts/agentphone-smoke.mjs
//   AGENTPHONE_API_KEY=sk_live_... pnpm smoke:agentphone
//
// Hits two read-only endpoints - GET /v1/usage (account/plan status) and
// GET /v1/calls?limit=1 (most recent call, if any) - and never places a call
// or sends a message. Never prints the key. If no key is set, it explains
// what to set and what a human should manually verify, then exits cleanly
// (it does not fail the run - this is a "not configured" state, not a bug).

const BASE = process.env.AGENTPHONE_BASE_URL || "https://api.agentphone.ai";
const key = process.env.AGENTPHONE_API_KEY;

function manualInstructions() {
  console.log(
    [
      "AGENTPHONE_API_KEY is not set, so no live request was made.",
      "",
      "To verify src/lib/agentphone.ts against the real API once a key exists:",
      "  1. Set AGENTPHONE_API_KEY=sk_live_... and re-run this script.",
      "  2. It will call GET /v1/usage and GET /v1/calls?limit=1 (read-only,",
      "     no call is placed) and print which fields the live API actually",
      "     returns.",
      "  3. Compare that field list against the field names placeCall()/",
      "     getCall() look for in src/lib/agentphone.ts (id/call_id/callId,",
      "     status, durationSec/duration_sec/duration, transcripts/transcript,",
      "     recordingUrl/recording_url, toNumber/to_number, fromNumber/",
      "     from_number, startedAt/started_at) and update the field lookups",
      "     there if the live API uses different names.",
      "  4. If you're comfortable placing one real test call, also manually",
      "     call POST /v1/calls against a number you control and confirm the",
      "     response includes a usable call id (this script will not do that",
      "     for you - it never places a call).",
    ].join("\n"),
  );
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path}: HTTP ${res.status} - ${text.slice(0, 200)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GET ${path}: response was not valid JSON`);
  }
}

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

if (!key) {
  manualInstructions();
  process.exit(0);
}

if (!/^sk_(live|test)_/.test(key)) {
  console.warn(
    "AGENTPHONE_API_KEY does not look like the documented sk_live_... / sk_test_... format. Continuing anyway.",
  );
}

const failures = [];
try {
  const usage = await getJson("/v1/usage");
  if (!isRecord(usage)) {
    failures.push(`GET /v1/usage: expected a JSON object, got ${Array.isArray(usage) ? "array" : typeof usage}`);
  } else {
    console.log(`GET /v1/usage: OK, keys = [${Object.keys(usage).join(", ") || "(none)"}]`);
  }

  const calls = await getJson("/v1/calls?limit=1");
  const list = Array.isArray(calls) ? calls : Array.isArray(calls?.calls) ? calls.calls : null;
  if (list === null) {
    failures.push(
      `GET /v1/calls?limit=1: expected an array (bare or under a "calls" key), got ${
        isRecord(calls) ? `object with keys [${Object.keys(calls).join(", ")}]` : typeof calls
      }`,
    );
  } else if (list.length === 0) {
    console.log("GET /v1/calls?limit=1: OK, no calls on this account yet (nothing to compare field names against)");
  } else {
    const sample = list[0];
    console.log(
      `GET /v1/calls?limit=1: OK, most recent call has keys = [${
        isRecord(sample) ? Object.keys(sample).join(", ") : typeof sample
      }]`,
    );
    console.log(
      "Compare these keys against the id/status/duration/transcript/recordingUrl/toNumber/fromNumber/startedAt lookups in src/lib/agentphone.ts.",
    );
  }
} catch (e) {
  failures.push(String(e?.message ?? e));
}

if (failures.length > 0) {
  console.error(`\nSMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nSMOKE PASSED");
