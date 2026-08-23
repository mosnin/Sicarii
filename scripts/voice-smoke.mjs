#!/usr/bin/env node
// Voice-native-CRM smoke test.
//
// This does NOT place a real phone call and does NOT hit AgentPhone's live
// API - it only exercises Scalar's own inbound webhook
// (/api/webhooks/agentphone) with synthetic payloads, to prove:
//   1. an unauthenticated / wrong-key request is refused (no CRM data leak),
//   2. a correctly-keyed request with a plausible payload shape gets back a
//      { speech } response,
//   3. a malformed payload degrades gracefully (never a raw 500/crash).
//
// Usage:
//   SCALAR_VOICE_WEBHOOK_URL=https://your-app/api/webhooks/agentphone \
//   SCALAR_VOICE_SECRET=<the key from Settings -> Voice> \
//   node scripts/voice-smoke.mjs
//   (or) pnpm smoke:voice
//
// With no SCALAR_VOICE_SECRET set, this reports "not configured" and exits
// cleanly (code 2) rather than crashing - the same contract as
// scripts/mcp-smoke.mjs.
//
// ── WHAT IS STILL OWED TO A LIVE ACCOUNT (read before trusting this in prod) ──
// AgentPhone's real inbound-call payload shape has not been verified against
// a live account (see src/app/api/webhooks/agentphone/route.ts and
// docs/decisions/0014-voice-native-crm.md). To close that gap, a human with a
// real AgentPhone account must:
//   1. Turn on Voice in Scalar Settings and paste the resulting webhook URL
//      into AgentPhone's inbound-call config for a real number.
//   2. Place one real inbound call and ask a simple question ("who do I need
//      to follow up with").
//   3. Check the Scalar server logs for that request. If the response the
//      caller heard was the generic "I didn't catch that" fallback, the
//      transcript field name in AgentPhone's real payload does not match any
//      candidate in extractTranscript() (route.ts) - inspect the raw request
//      body (log it temporarily, non-production) and add the real field name
//      to the candidate list.
//   4. Confirm AgentPhone actually reads the JSON `speech` field aloud, and
//      note here (and in the Gate Card) any required response envelope
//      differences (e.g. a different key name, SSML, or a required HTTP
//      status) once observed.
//   5. Confirm whether AgentPhone signs webhook requests (e.g. an HMAC
//      header). If it does, add real signature verification alongside the
//      per-user secret for defense in depth (the secret alone is already
//      sufficient to authenticate, but a signature check would catch a leaked
//      key being replayed from a non-AgentPhone origin).

const url = process.env.SCALAR_VOICE_WEBHOOK_URL || process.argv[2];
const secret = process.env.SCALAR_VOICE_SECRET;

if (!url || !secret) {
  console.log(
    "Voice smoke: not configured (set SCALAR_VOICE_WEBHOOK_URL and SCALAR_VOICE_SECRET to run this against a real deployment). Skipping cleanly.",
  );
  process.exit(2);
}

async function post(body, key) {
  const target = key ? `${url}?key=${encodeURIComponent(key)}` : url;
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response is itself a finding, handled by the caller */
  }
  return { status: res.status, json, text };
}

const failures = [];

try {
  // 1. No key at all -> must be refused, never CRM data.
  const noKey = await post({ text: "who do I need to follow up with" }, null);
  if (noKey.status !== 401) {
    failures.push(`no-key request: expected 401, got ${noKey.status}`);
  } else {
    console.log("no-key request -> 401 Unauthorized: PASS");
  }

  // 2. Wrong key -> must be refused.
  const wrongKey = await post({ text: "who do I need to follow up with" }, "0".repeat(64));
  if (wrongKey.status !== 401) {
    failures.push(`wrong-key request: expected 401, got ${wrongKey.status}`);
  } else {
    console.log("wrong-key request -> 401 Unauthorized: PASS");
  }

  // 3. Real key, plausible payload -> should get back real speech.
  const real = await post({ text: "who do I need to follow up with today" }, secret);
  if (real.status === 501) {
    console.log(
      "real-key request -> 501 (voice not enabled / AgentPhone not connected for this account). " +
        "Enable Voice in Settings for the account that owns this secret, then re-run.",
    );
  } else if (real.status !== 200 || typeof real.json?.speech !== "string" || !real.json.speech.trim()) {
    failures.push(`real-key request: expected 200 with a non-empty speech string, got ${real.status} ${real.text.slice(0, 200)}`);
  } else {
    console.log(`real-key request -> 200, speech: "${real.json.speech}"`);
  }

  // 4. Malformed payload (not JSON) with a real key must still degrade
  //    gracefully - never a raw crash/500 with no body.
  const malformedRes = await fetch(`${url}?key=${encodeURIComponent(secret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ this is not valid json",
  });
  const malformedText = await malformedRes.text();
  let malformedJson = null;
  try {
    malformedJson = JSON.parse(malformedText);
  } catch {
    /* fall through to failure below */
  }
  if (!malformedJson || (malformedRes.status !== 200 && malformedRes.status !== 501)) {
    failures.push(
      `malformed-payload request: expected a graceful JSON response (200 or 501), got ${malformedRes.status} ${malformedText.slice(0, 200)}`,
    );
  } else {
    console.log(`malformed-payload request -> ${malformedRes.status} (degraded gracefully): PASS`);
  }
} catch (e) {
  failures.push(String(e?.message ?? e));
}

if (failures.length > 0) {
  console.error(`\nSMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  "\nSMOKE PASSED (Scalar-side checks only). Read the payload-shape verification steps in this " +
    "file's header before trusting real AgentPhone traffic in production.",
);
