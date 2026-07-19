// AgentPhone client - per-user key (User.agentPhoneApiKey). Lets a connected
// agent place and track phone calls to leads, mirroring the AgentMail layer.
// Base: https://api.agentphone.ai  Auth: Bearer <key> (keys look like sk_live_...)
// Docs: https://agentphone.ai/skills.md
//
// Response shapes vary, so parsing is defensive (str/num helpers). Confirm the
// exact endpoint/field names against the live docs before enabling in prod; the
// whole layer is dormant until a user connects a key.
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

async function ap<T>(key: string, path: string, init?: RequestInit): Promise<T> {
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
  return (text ? JSON.parse(text) : {}) as T;
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

  const data = await ap<Record<string, unknown>>(key, "/v1/calls", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    callId: str(data.id) ?? str(data.call_id) ?? "",
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
function transcriptToText(t: unknown): string | undefined {
  if (Array.isArray(t)) {
    const lines = t
      .map((m) => {
        const o = m as Record<string, unknown>;
        const role = str(o.role) ?? str(o.speaker);
        const text = str(o.text) ?? str(o.content) ?? str(o.message);
        return text ? (role ? `${role}: ${text}` : text) : undefined;
      })
      .filter((l): l is string => Boolean(l));
    return lines.length ? lines.join("\n") : undefined;
  }
  return str(t);
}

/** Fetch a call's current status + transcript. GET /v1/calls/{id}. */
export async function getCall(key: string, callId: string): Promise<CallDetail> {
  const data = await ap<Record<string, unknown>>(key, `/v1/calls/${encodeURIComponent(callId)}`);
  return {
    status: str(data.status),
    durationSec: num(data.durationSec) ?? num(data.duration_sec) ?? num(data.duration),
    transcript: transcriptToText(data.transcripts ?? data.transcript),
    recordingUrl: str(data.recordingUrl) ?? str(data.recording_url),
    toNumber: str(data.toNumber) ?? str(data.to_number),
    fromNumber: str(data.fromNumber) ?? str(data.from_number),
  };
}
