// AgentPhone client - per-user key (User.agentPhoneApiKey). Lets a connected
// agent place and track phone calls to leads, mirroring the AgentMail layer.
// Base: https://api.agentphone.ai  Auth: Bearer <key> (keys look like sk_live_...)
// Docs: https://agentphone.ai/skills.md
//
// Response shapes are UNVERIFIED against the live API (no key has ever been
// exercised against it here), so every field read off a response is parsed
// defensively: runtime typeof/shape checks before use, never a bare property
// access on an assumed path. An unexpected shape degrades to null/undefined
// defaults and logs a console.warn naming the offending path and the keys/
// shape actually present, so a bad integration is loud in server logs
// instead of silently producing something that looks like success (e.g. a
// placeCall() with callId: "" that can never be synced later - see
// syncContactCall in crm-operations.ts). Once a real key exists, run
// `node scripts/agentphone-smoke.mjs` to verify these shapes against the
// live API and update this file if they differ.
import { fetchWithTimeout } from "@/lib/http";
import { randomBytes } from "node:crypto";

const BASE = "https://api.agentphone.ai";

export function isAgentPhoneConfigured(key?: string | null): boolean {
  return Boolean(key && key.trim());
}

/** A high-entropy, per-user secret for the INBOUND voice webhook
 *  (/api/webhooks/agentphone). Generated once when a user turns on voice in
 *  Settings and embedded as `?key=<secret>` in the exact URL they paste into
 *  their AgentPhone inbound-call webhook config. This token is the sole
 *  mechanism that authenticates an inbound call to a specific Scalar user -
 *  AgentPhone's payload shape and any signing scheme are unverified, so
 *  nothing in the call body is ever trusted for identity (see the webhook
 *  route for the full reasoning). 32 random bytes = 256 bits of entropy,
 *  hex-encoded so it drops cleanly into a URL query string. */
export function generateVoiceInboundSecret(): string {
  return randomBytes(32).toString("hex");
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
/** True for a plain JSON object (not null, not an array). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** Short, value-free description of a shape for warning logs (never dumps values). */
function describeShape(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(length=${v.length})`;
  if (typeof v === "object") return `object(keys=${Object.keys(v as object).join(",") || "none"})`;
  return typeof v;
}

async function ap(key: string, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AgentPhone ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[agentphone] ${path}: response body was not valid JSON (length=${text.length})`);
    return {};
  }
}

/** Extracts a plain object from an ap() response, warning and degrading to {} on any other shape. */
function asRecord(path: string, raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  console.warn(`[agentphone] ${path}: expected a JSON object response, got ${describeShape(raw)}`);
  return {};
}

export interface PlacedCall {
  callId: string;
  status?: string;
  startedAt?: string;
}

/** Place an outbound call. POST /v1/calls (agentId, toNumber E.164, systemPrompt). */
export async function placeCall(
  key: string,
  input: {
    toNumber: string;
    systemPrompt: string;
    agentId?: string;
    fromNumberId?: string;
    initialGreeting?: string;
  },
): Promise<PlacedCall> {
  const body: Record<string, unknown> = {
    toNumber: input.toNumber,
    systemPrompt: input.systemPrompt,
  };
  if (input.agentId) body.agentId = input.agentId;
  if (input.fromNumberId) body.fromNumberId = input.fromNumberId;
  if (input.initialGreeting) body.initialGreeting = input.initialGreeting;

  const path = "POST /v1/calls";
  const raw = await ap(key, "/v1/calls", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = asRecord(path, raw);

  // callId is the primary key everything downstream (sync, log lookups) is
  // keyed on. If we can't find one under any known field name, warn loudly
  // rather than let a "" flow silently into a call log that can never sync.
  const callId = str(data.id) ?? str(data.call_id) ?? str(data.callId);
  if (!callId) {
    console.warn(
      `[agentphone] ${path}: response has no usable call id (checked id, call_id, callId). ` +
        `Keys present: ${Object.keys(data).join(", ") || "(none)"}. ` +
        `This call cannot be synced later without one.`,
    );
  }

  return {
    callId: callId ?? "",
    status: str(data.status),
    startedAt: str(data.startedAt) ?? str(data.started_at),
  };
}

export interface CallDetail {
  status?: string;
  durationSec?: number;
  transcript?: string;
  recordingUrl?: string;
  toNumber?: string;
  fromNumber?: string;
}

// AgentPhone returns a `transcripts` array of {role/speaker, text/content}.
// Each entry is validated before use; entries with an unexpected shape are
// dropped (not thrown on) and counted for a single summary warning.
function transcriptToText(path: string, t: unknown): string | undefined {
  if (Array.isArray(t)) {
    const lines: string[] = [];
    let skipped = 0;
    for (const entry of t) {
      if (!isRecord(entry)) {
        skipped++;
        continue;
      }
      const role = str(entry.role) ?? str(entry.speaker);
      const text = str(entry.text) ?? str(entry.content) ?? str(entry.message);
      if (text) lines.push(role ? `${role}: ${text}` : text);
      else skipped++;
    }
    if (skipped > 0) {
      console.warn(
        `[agentphone] ${path}: skipped ${skipped} transcript ${skipped === 1 ? "entry" : "entries"} with an unexpected shape`,
      );
    }
    return lines.length ? lines.join("\n") : undefined;
  }
  if (t === undefined || t === null) return undefined;
  const asString = str(t);
  if (asString === undefined) {
    console.warn(`[agentphone] ${path}: transcript field had an unexpected shape (${describeShape(t)})`);
  }
  return asString;
}

/** Fetch a call's current status + transcript. GET /v1/calls/{id}. */
export async function getCall(key: string, callId: string): Promise<CallDetail> {
  const path = `GET /v1/calls/${callId}`;
  const raw = await ap(key, `/v1/calls/${encodeURIComponent(callId)}`);
  const data = asRecord(path, raw);
  return {
    status: str(data.status),
    durationSec: num(data.durationSec) ?? num(data.duration_sec) ?? num(data.duration),
    transcript: transcriptToText(path, data.transcripts ?? data.transcript),
    recordingUrl: str(data.recordingUrl) ?? str(data.recording_url),
    toNumber: str(data.toNumber) ?? str(data.to_number),
    fromNumber: str(data.fromNumber) ?? str(data.from_number),
  };
}
