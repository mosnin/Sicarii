// One-click unsubscribe: a signed, storage-free token so a recipient can opt
// out from a link in the email without us keeping a lookup table of tokens.
//
// The token is HMAC-signed over (userId, email), so it cannot be forged and
// cannot be pointed at a different tenant or a different address than the one
// it was minted for. It carries no expiry: an unsubscribe link must work
// forever, because a person who kept the email for a year and then asks off the
// list is exactly who the law protects.
//
// Bulk-sender rules (Google/Yahoo) want BOTH a List-Unsubscribe header with a
// one-click POST and a visible link in the body. buildUnsubscribe() returns the
// pieces the send path stamps onto every outbound message; the /api/unsubscribe
// route verifies the token and records the opt-out.

import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string | null {
  const explicit = process.env.UNSUBSCRIBE_SECRET?.trim();
  if (explicit) return explicit;
  // Derive from a server secret so no extra config is required, and it is
  // stable across redeploys. Fails closed (null) only on real misconfiguration.
  const base = (process.env.MCP_OAUTH_SECRET || process.env.CLERK_SECRET_KEY)?.trim();
  return base || null;
}

/** base64url without padding, so the token is URL-safe with no escaping. */
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export interface UnsubPayload {
  userId: string;
  email: string;
}

/** Mint a token for a (tenant, recipient) pair, or null if no signing secret
 *  is configured (the send path then omits the link and logs it). */
export function mintUnsubscribeToken(payload: UnsubPayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify({ u: payload.userId, e: payload.email.toLowerCase() })));
  const sig = b64url(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify a token and return its payload, or null if it is malformed, unsigned,
 *  or tampered. Constant-time comparison on the signature. */
export function verifyUnsubscribeToken(token: string): UnsubPayload | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", key).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(body).toString("utf8")) as { u?: unknown; e?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "string") return null;
    return { userId: parsed.u, email: parsed.e };
  } catch {
    return null;
  }
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "https://tryscalar.xyz");
}

export interface UnsubscribeArtifacts {
  /** Full https URL a recipient clicks. */
  url: string | null;
  /** Value for the List-Unsubscribe header (URL form; add mailto if desired). */
  listUnsubscribeHeader: string | null;
  /** The one-click POST header bulk senders now expect alongside it. */
  listUnsubscribePostHeader: string | null;
  /** A plain-text footer line to append to the body. */
  footerText: string | null;
}

/** Everything the send path needs to make one message compliant. Returns nulls
 *  (rather than throwing) when no signing secret exists, so a misconfigured
 *  deploy degrades to "no link" loudly in logs rather than blocking the send;
 *  the send path treats a null url as a reason to warn. */
export function buildUnsubscribe(payload: UnsubPayload): UnsubscribeArtifacts {
  const token = mintUnsubscribeToken(payload);
  if (!token) {
    return { url: null, listUnsubscribeHeader: null, listUnsubscribePostHeader: null, footerText: null };
  }
  const url = `${appBaseUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    url,
    listUnsubscribeHeader: `<${url}>`,
    listUnsubscribePostHeader: "List-Unsubscribe=One-Click",
    footerText: `If you would rather not hear from us, unsubscribe here: ${url}`,
  };
}
