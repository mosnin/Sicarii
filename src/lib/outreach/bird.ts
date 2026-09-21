// Bird Email API client (Card 0015).
//
// The send rail for Scalar outreach: POST /v1/email/messages with an explicit
// category (cold outreach ALWAYS sends as `marketing` so Bird's suppression —
// bounces, complaints, unsubscribes — protects reputation automatically) and
// the org-default IP pool (dedicated pools are a future ip_pool_id flip, not a
// re-plumb). Delivery is async: 202 accepted, then per-recipient outcomes via
// webhook + message reads. Docs: https://bird.com/en-us/docs/guides/email
// Auth: Bearer API key (BIRD_API_KEY). Webhook auth: HMAC-SHA256 over the raw
// body with BIRD_WEBHOOK_SECRET (verifyBirdSignature).
//
// Shapes follow the public docs but have NEVER been exercised live here, so
// every response field is parsed defensively (agentphone.ts precedent) and
// drift is loud (console.warn with the shape, never values).

import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.bird.com";

export function isBirdConfigured(key?: string | null): boolean {
  return Boolean((key ?? process.env.BIRD_API_KEY)?.trim());
}

function keyOf(key?: string | null): string {
  const v = (key ?? process.env.BIRD_API_KEY ?? "").trim();
  if (!v) throw new Error("Bird is not configured (BIRD_API_KEY missing).");
  return v;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function describeShape(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(length=${v.length})`;
  if (typeof v === "object") return `object(keys=${Object.keys(v).join(",") || "none"})`;
  return typeof v;
}

async function bird<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bird ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return (text ? (JSON.parse(text) as T) : {}) as T;
}

export interface BirdSendArgs {
  from: string;
  to: string;
  subject: string;
  /** Plain-text body. */
  text: string;
  /** HTML body (optional; text is the fallback and the spam-safe default). */
  html?: string;
  /** Reply-to address (the mailbox, so replies route home). */
  replyTo?: string;
  /** Dedicated pool id (ipp_...) — omit for the org default (shared) pool. */
  ipPoolId?: string;
  /** Client-side idempotency key (one key covers retries of the same send). */
  idempotencyKey?: string;
}

export interface BirdSendResult {
  messageId: string;
}

/**
 * Queue one cold email via Bird. Always `marketing` category: that is what
 * opts the send into full suppression policy (blocked on bounce/complaint/
 * unsubscribe), which is the entire reputation-safety story for cold volume.
 * Every message carries List-Unsubscribe headers (one-click) — required by
 * Gmail bulk-sender rules and non-negotiable for cold mail.
 */
export async function sendMarketingEmail(
  args: BirdSendArgs,
  opts: { key?: string; unsubscribeUrl: string } = { unsubscribeUrl: "" },
): Promise<BirdSendResult> {
  const key = keyOf(opts.key);
  if (!opts.unsubscribeUrl) throw new Error("unsubscribeUrl is required for cold sends.");
  const raw: unknown = await bird(key, "/v1/email/messages", {
    method: "POST",
    // NOTE: single-message idempotency is enforced DB-side via
    // OutreachSend.claimKey (unique claim before transmit), so concurrent
    // scheduler ticks can never double-send the same row.
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      category: "marketing",
      ...(args.ipPoolId ? { ip_pool_id: args.ipPoolId } : {}),
      headers: {
        "List-Unsubscribe": `<${opts.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!isRecord(raw)) {
    console.warn(`[bird] unexpected send shape: ${describeShape(raw)}`);
    throw new Error("Bird send returned an unexpected shape.");
  }
  const id =
    str(raw.message_id) ?? str(raw.messageId) ?? str(raw.id) ??
    (isRecord(raw.message) ? (str(raw.message.message_id) ?? str(raw.message.id)) : undefined);
  if (!id) {
    console.warn(`[bird] send accepted but id shape unknown: ${describeShape(raw)}`);
    throw new Error("Bird send accepted but no message id was returned.");
  }
  void args.idempotencyKey;
  return { messageId: id };
}

export type BirdDeliveryEvent =
  | "delivered"
  | "bounced"
  | "deferred"
  | "complained"
  | "opened"
  | "clicked"
  | "rejected"
  | "unknown";

export interface BirdWebhookEvent {
  event: BirdDeliveryEvent;
  messageId: string | null;
  to: string | null;
  bounceKind: "hard" | "soft" | null;
  raw: unknown;
}

/** Parse a Bird delivery webhook payload defensively. Never throws on shape drift — returns event "unknown". */
export function parseBirdWebhook(payload: unknown): BirdWebhookEvent {
  if (!isRecord(payload)) return { event: "unknown", messageId: null, to: null, bounceKind: null, raw: payload };
  const type = str(payload.type)?.toLowerCase() ?? str(payload.event)?.toLowerCase() ?? "";
  const data = isRecord(payload.data) ? payload.data : payload;
  const messageId = str(data.message_id) ?? str(data.messageId) ?? str(data.id);
  const to = str(data.to) ?? (Array.isArray(data.to) ? str(data.to[0]) : undefined) ?? null;
  const bounceKindRaw = str(data.bounce_kind ?? data.bounceKind)?.toLowerCase();
  const bounceKind = bounceKindRaw === "hard" ? "hard" : bounceKindRaw === "soft" ? "soft" : null;

  let event: BirdDeliveryEvent = "unknown";
  if (type.includes("deliver")) event = "delivered";
  else if (type.includes("bounce")) event = "bounced";
  else if (type.includes("defer")) event = "deferred";
  else if (type.includes("complaint") || type.includes("spam")) event = "complained";
  else if (type.includes("open")) event = "opened";
  else if (type.includes("click")) event = "clicked";
  else if (type.includes("reject") || type.includes("suppress")) event = "rejected";

  if (event === "unknown") console.warn(`[bird] unknown webhook type: ${type || "(missing)"}`);
  return { event, messageId: messageId ?? null, to, bounceKind, raw: payload };
}

/**
 * Verify a Bird webhook signature: HMAC-SHA256 of the RAW body with
 * BIRD_WEBHOOK_SECRET, compared timing-safe. Returns false (never throws)
 * when the secret is missing or the signature mismatches — the route then
 * 401s. NOTE: the exact header name/encoding is per Bird docs and UNVERIFIED
 * against a live sample; re-check with the first real delivery before
 * trusting it blindly (same drill as agentphone-smoke).
 */
export function verifyBirdSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = (process.env.BIRD_WEBHOOK_SECRET ?? "").trim();
  if (!secret || !signatureHeader) return false;
  const hex = signatureHeader.replace(/^sha256=/i, "").trim();
  let theirs: Buffer;
  try {
    theirs = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  const mine = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return theirs.length === mine.length && timingSafeEqual(theirs, mine);
}

export interface BirdDomainVerification {
  verified: boolean;
  dkimSelector: string | null;
  dkimTarget: string | null;
  returnPathCname: string | null;
  detail: string;
}

/** Read a sending domain's verification state (records Bird expects us to publish). */
export async function getDomainVerification(
  domain: string,
  opts: { key?: string } = {},
): Promise<BirdDomainVerification> {
  const key = keyOf(opts.key);
  const raw: unknown = await bird(key, `/v1/email/domains/${encodeURIComponent(domain)}`);
  if (!isRecord(raw)) {
    console.warn(`[bird] unexpected domain shape: ${describeShape(raw)}`);
    return { verified: false, dkimSelector: null, dkimTarget: null, returnPathCname: null, detail: "unexpected shape" };
  }
  return {
    verified: raw.verified === true || str(raw.status)?.toLowerCase() === "verified",
    dkimSelector: str(raw.dkim_selector ?? raw.dkimSelector) ?? null,
    dkimTarget: str(raw.dkim_target ?? raw.dkimTarget ?? raw.dkim_value) ?? null,
    returnPathCname: str(raw.return_path ?? raw.returnPath ?? raw.cname) ?? null,
    detail: str(raw.status) ?? (raw.verified === true ? "verified" : "unverified"),
  };
}
