import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { voiceIntent } from "@/lib/voice-intent";

// POST /api/webhooks/agentphone - AgentPhone's inbound-call webhook.
//
// THE FEATURE: the operator calls their own AgentPhone number and asks
// Scalar something out loud ("who do I need to follow up with today").
// AgentPhone transcribes the request and POSTs it here; we route the intent
// to the CRM, and return { speech } for AgentPhone to voice back to the
// caller.
//
// ── PAYLOAD SHAPE: OWED TO VERIFICATION ─────────────────────────────────────
// AgentPhone's inbound-call payload shape is UNVERIFIED (agentphone.ts admits
// the same for its own outbound response shapes). We do not have a live
// AgentPhone account to inspect a real request against, so extractTranscript()
// below guesses at plausible field names and is defensive about every one of
// them (typeof-guarded, never throws on an unexpected shape, degrades to null
// -> a generic "I didn't catch that" response). This MUST be verified against
// a real AgentPhone account before this is trusted in production - see
// docs/decisions/0014-voice-native-crm.md and scripts/voice-smoke.mjs.
//
// ── AUTHENTICATION: THE SECURITY-CRITICAL PART ──────────────────────────────
// This endpoint answers with real CRM data, so it MUST know exactly which
// Scalar user is calling before it does anything else. We do NOT trust
// anything in AgentPhone's payload for identity - not a phone number (spoofable,
// and we don't control the inbound number's provenance), not an agent/account
// id (shape unverified, and even if present we have no way to confirm
// AgentPhone signs its webhooks).
//
// Instead: each Scalar user who turns on voice in Settings gets a unique,
// high-entropy (256-bit) secret, `User.voiceInboundSecret`, generated server
// side (src/lib/agentphone.ts#generateVoiceInboundSecret). Settings shows them
// the exact webhook URL to paste into AgentPhone's inbound-webhook config:
// `.../api/webhooks/agentphone?key=<secret>`. On every inbound call, AgentPhone
// hits that exact URL, so the `key` query param IS the caller's identity - a
// capability URL, the same pattern Stripe Connect, Zapier, and most
// third-party inbound-webhook receivers use for per-tenant endpoints. We look
// it up with a direct equality match against the unique indexed
// `voiceInboundSecret` column; no match, no voice, no enabled flag, no
// connected AgentPhone key -> refuse (401/501). We never fall back to "the
// only configured user" or any other implicit identity - if we cannot
// securely identify the caller, we refuse rather than guess, full stop.
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    // 30/min/IP: real inbound-call volume from one number is low; this only
    // needs to blunt brute-forcing of the key or abuse, not throttle real use.
    const rl = await checkRateLimit(`agentphone-webhook:${ip}`, 30, 60_000);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const token = req.nextUrl.searchParams.get("key");
    // 256-bit secrets hex-encode to 64 chars; anything drastically shorter is
    // not even a plausible token and is rejected before a DB round trip.
    if (!token || token.length < 32) {
      console.warn("[agentphone-webhook] rejected: missing or malformed key");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { voiceInboundSecret: token },
      select: { id: true, voiceEnabled: true, agentPhoneApiKey: true },
    });

    if (!user) {
      console.warn("[agentphone-webhook] rejected: no user matches the provided key");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.voiceEnabled || !user.agentPhoneApiKey) {
      // A valid key that belongs to a user who has since disabled voice or
      // disconnected AgentPhone must still refuse - a stale key must not keep
      // working. We do not leak WHICH condition failed.
      console.warn(`[agentphone-webhook] rejected: voice not configured for user ${user.id}`);
      return NextResponse.json({ error: "Voice is not configured for this account" }, { status: 501 });
    }

    const body = await req.json().catch(() => null);
    const text = extractTranscript(body);

    const { speech, intent } = await voiceIntent(user.id, text ?? "");

    // Auditable trail: every inbound voice interaction is logged as an
    // Activity so it shows up like any other agent action. Never blocks the
    // spoken response back to the caller if logging itself fails.
    try {
      const heard = (text ?? "(no transcript recognized in the payload)").slice(0, 500);
      await prisma.activity.create({
        data: {
          userId: user.id,
          kind: "call",
          channel: "phone",
          body: `Inbound voice call (${intent}). Heard: "${heard}". Answered: "${speech.slice(0, 500)}"`,
        },
      });
    } catch (e) {
      console.warn("[agentphone-webhook] failed to log inbound voice activity", e);
    }

    return NextResponse.json({ speech, ok: true });
  } catch (e) {
    console.error("POST /api/webhooks/agentphone", e);
    // A live caller is on the line; a bare 500 with no body leaves AgentPhone
    // nothing to say. Degrade to a spoken apology instead of a hard failure.
    return NextResponse.json(
      { speech: "Sorry, something went wrong on my end. Please try again shortly.", ok: false },
      { status: 200 },
    );
  }
}

// Every candidate field name here is a GUESS at AgentPhone's real inbound
// shape (see the file header). Each is typeof-guarded individually so an
// unexpected type on any one field can never throw; if nothing usable is
// found we return null and the caller gets a graceful "I didn't catch that"
// instead of a crash. Extend this list once a live payload is inspected
// (scripts/voice-smoke.mjs prints guidance for that verification step).
function extractTranscript(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const nested = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  const call = nested(o.call);
  const data = nested(o.data);

  const candidates: unknown[] = [
    o.text,
    o.transcript,
    o.transcription,
    o.message,
    o.query,
    o.input,
    o.utterance,
    o.speech,
    o.prompt,
    o.request,
    call?.transcript,
    call?.text,
    data?.text,
    data?.transcript,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 2000);
  }
  return null;
}
