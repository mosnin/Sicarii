// OAuth 2.1 token + PKCE helpers for Scalar's MCP authorization server.
// Tokens are stateless signed JWTs (HS256 via jose), so no token table is
// needed; the MCP route verifies an access token straight back to a userId.
// Identity comes from Clerk at /authorize; codes/tokens are bound to that user.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { createHash } from "node:crypto";

const enc = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.MCP_OAUTH_SECRET || process.env.CLERK_SECRET_KEY;
  if (!s) throw new Error("MCP_OAUTH_SECRET (or CLERK_SECRET_KEY) must be set for OAuth");
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
export type RefreshClaims = JWTPayload & { typ: "refresh"; sub: string; scope?: string };

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
  return sign({ sub: userId, typ: "refresh", ...(scope ? { scope } : {}) }, REFRESH_TTL);
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
