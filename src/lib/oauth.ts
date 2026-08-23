// OAuth 2.1 token + PKCE helpers for Scalar's MCP authorization server.
// Tokens are stateless signed JWTs (HS256 via jose), so no token table is
// needed; the MCP route verifies an access token straight back to a userId.
// Identity comes from Clerk at /authorize; codes/tokens are bound to that user.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const enc = new TextEncoder();

let warnedFallback = false;
function secret(): Uint8Array {
  const s = process.env.MCP_OAUTH_SECRET || process.env.CLERK_SECRET_KEY;
  if (!s) throw new Error("MCP_OAUTH_SECRET (or CLERK_SECRET_KEY) must be set for OAuth");
  if (!process.env.MCP_OAUTH_SECRET && process.env.NODE_ENV === "production" && !warnedFallback) {
    warnedFallback = true;
    console.error(
      "[oauth] SECURITY: MCP_OAUTH_SECRET is not set; falling back to CLERK_SECRET_KEY. " +
        "Set a distinct MCP_OAUTH_SECRET so OAuth tokens do not share signing material with Clerk.",
    );
  }
  return enc.encode(s);
}

export type CodeClaims = JWTPayload & {
  typ: "code";
  sub: string; // userId
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope?: string;
};
export type AccessClaims = JWTPayload & { typ: "access"; sub: string; scope?: string };
export type RefreshClaims = JWTPayload & {
  typ: "refresh";
  sub: string;
  scope?: string;
  jti: string; // unique token id, for rotation + revocation
};

async function sign(payload: JWTPayload, expSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expSeconds}s`)
    .sign(secret());
}

export const ACCESS_TTL = 3600; // 1h
const CODE_TTL = 300; // 5m
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30d

export function signAuthCode(c: Omit<CodeClaims, "typ" | "iat" | "exp">) {
  return sign({ ...c, typ: "code" }, CODE_TTL);
}
export function signAccessToken(userId: string, scope?: string) {
  return sign({ sub: userId, typ: "access", ...(scope ? { scope } : {}) }, ACCESS_TTL);
}
export function signRefreshToken(userId: string, scope?: string) {
  // Every refresh token carries a unique jti so it can be individually revoked
  // on rotation (reuse detection).
  return sign({ sub: userId, typ: "refresh", jti: randomUUID(), ...(scope ? { scope } : {}) }, REFRESH_TTL);
}

/**
 * Rotate a presented refresh token: verify it, reject if its jti was already
 * consumed (reuse of a rotated/stolen token), otherwise revoke this jti and
 * return the claims so the caller can mint a fresh access+refresh pair. Returns
 * null when the token is invalid, the wrong type, or already revoked.
 */
export async function consumeRefreshToken(rt: string): Promise<RefreshClaims | null> {
  const claims = await verifyToken<RefreshClaims>(rt);
  if (!claims || claims.typ !== "refresh" || typeof claims.sub !== "string" || !claims.jti) {
    return null;
  }
  const exp = typeof claims.exp === "number" ? new Date(claims.exp * 1000) : new Date(Date.now() + REFRESH_TTL * 1000);
  try {
    // Inserting the jti IS the consume: a replay of the same token collides
    // (P2002) and is rejected. This is atomic - no check-then-act window.
    await prisma.revokedToken.create({
      data: { jti: claims.jti, userId: claims.sub, expiresAt: exp },
    });
  } catch {
    return null; // already consumed => reuse => reject
  }
  return claims;
}

// Stateless Dynamic Client Registration: instead of a random client_id we issue
// a SIGNED client_id that embeds the client's registered redirect_uris. At
// /authorize we verify the signature and require an exact redirect_uri match
// before redirecting anything to it - this closes the open-redirect /
// authorization-code-phishing hole without needing a client table.
const CLIENT_TTL = 60 * 60 * 24 * 365; // 1y
export type ClientClaims = JWTPayload & { typ: "client"; redirect_uris: string[] };

export function signClientId(redirectUris: string[]) {
  return sign({ typ: "client", redirect_uris: redirectUris }, CLIENT_TTL);
}

/** The redirect_uris bound into a signed client_id, or null if it isn't one. */
export async function clientRedirectUris(clientId: string): Promise<string[] | null> {
  if (!clientId) return null;
  const claims = await verifyToken<ClientClaims>(clientId);
  if (!claims || claims.typ !== "client" || !Array.isArray(claims.redirect_uris)) return null;
  return claims.redirect_uris.filter((u): u is string => typeof u === "string");
}

export async function verifyToken<T extends JWTPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

/** Resolve an OAuth access token to a userId (null if not a valid access token). */
export async function userIdFromAccessToken(token: string): Promise<string | null> {
  const claims = await verifyToken<AccessClaims>(token);
  return claims && claims.typ === "access" && typeof claims.sub === "string" ? claims.sub : null;
}

/** PKCE S256 check: base64url(sha256(verifier)) === challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const hash = createHash("sha256").update(verifier).digest("base64url");
  return hash === challenge;
}
