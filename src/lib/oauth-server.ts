// Scalar's OAuth 2.1 authorization server.
//
// Stateful and hash-at-rest: authorization codes, access tokens and refresh
// tokens are stored ONLY as SHA-256 hashes (same posture as ApiKey.hashedKey),
// so a database leak yields nothing a client could present. PKCE S256 is
// mandatory, redirect URIs match byte for byte, codes are single use for ten
// minutes, and refresh tokens rotate on every use.
//
// Replay is treated as a security event, not a typo: presenting a spent code or
// a rotated refresh token revokes the whole grant family. See docs/OAUTH.md.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { clientRedirectUris } from "@/lib/oauth";

/* ------------------------------- lifetimes ------------------------------- */

export const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1h
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d
export const AUTH_CODE_TTL_SECONDS = 600; // 10m, per the spec's single-use code
const CONSENT_TICKET_TTL_SECONDS = 600; // how long a rendered consent screen is live

/* --------------------------------- scopes -------------------------------- */

/** Every scope this server will ever issue, with the plain words the consent
 *  screen shows. Keep the set small: a scope nobody can explain is a scope
 *  nobody can consent to. */
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Confirm which Scalar account you are",
  profile: "See your name, picture and workspace",
  email: "See your email address",
  "crm:read": "Read your contacts, companies, activities and pipelines",
  "crm:write": "Create and update records in your CRM",
  mcp: "Run Scalar's agent tools on your behalf",
};

export const SUPPORTED_SCOPES = Object.keys(SCOPE_DESCRIPTIONS);

/** What a client gets when it asks for nothing. */
export const DEFAULT_SCOPES = ["openid", "profile", "crm:read"];

/** Scopes that may call /oauth/userinfo. */
export const USERINFO_SCOPES = ["openid", "profile"];

export function parseScopes(raw?: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const s of raw.split(/[\s+]+/)) if (s) seen.add(s);
  return [...seen];
}

export function formatScopes(scopes: string[]): string {
  return scopes.join(" ");
}

/** The requested scopes, in the order asked, kept to what the client may have
 *  and what this server knows. Anything unknown is dropped, never granted. */
export function narrowScopes(requested: string[], allowed: string[]): string[] {
  const ceiling = new Set(allowed.length ? allowed : SUPPORTED_SCOPES);
  return requested.filter((s) => ceiling.has(s) && SUPPORTED_SCOPES.includes(s));
}

/* ------------------------------ secret material --------------------------- */

const CODE_PREFIX = "sco_ac_";
const ACCESS_PREFIX = "sco_at_";
const REFRESH_PREFIX = "sco_rt_";

/** SHA-256 hex. The only form a code or token is ever written down in. */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mintSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

/**
 * PKCE S256: base64url(sha256(verifier)) must equal the stored challenge.
 * Compared with timingSafeEqual over the raw digests so a wrong verifier leaks
 * nothing through response timing.
 */
export function verifyPkceS256(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  if (!challenge) return false;
  const actual = createHash("sha256").update(verifier).digest();
  const expected = Buffer.from(challenge, "base64url");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Byte for byte, against the registered list. Never a prefix match, never a
 *  fallback to the first registered URI. */
export function matchRedirectUri(registered: string[], candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  return registered.some((uri) => uri === candidate);
}

/* ------------------------------- clients ---------------------------------- */

export interface ResolvedClient {
  /** oauth_clients.id (the row), not the public identifier. */
  rowId: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
}

/**
 * Look up a client by its public identifier.
 *
 * Falls back to the legacy stateless registration: /api/oauth/register used to
 * issue a SIGNED client_id with the redirect URIs baked into it. Those ids are
 * still in the wild, so when one verifies we materialise a real client row for
 * it the first time it shows up here. Only ids this deployment signed can
 * verify, so this cannot be used to plant a client.
 */
export async function resolveClient(clientId: string | null | undefined): Promise<ResolvedClient | null> {
  if (!clientId) return null;

  const row = await prisma.oauthClient.findUnique({ where: { clientId } });
  if (row) {
    if (row.disabledAt) return null;
    return {
      rowId: row.id,
      clientId: row.clientId,
      name: row.name,
      redirectUris: row.redirectUris,
      scopes: row.scopes,
    };
  }

  const legacyUris = await clientRedirectUris(clientId).catch(() => null);
  if (!legacyUris || legacyUris.length === 0) return null;
  const created = await prisma.oauthClient.create({
    data: {
      clientId,
      name: "MCP client",
      redirectUris: legacyUris,
      scopes: ["mcp"],
      clientType: "public",
    },
  });
  return {
    rowId: created.id,
    clientId: created.clientId,
    name: created.name,
    redirectUris: created.redirectUris,
    scopes: created.scopes,
  };
}

/** Register a client. Used by /oauth/register and by any seed script. */
export async function registerClient(input: {
  name: string;
  redirectUris: string[];
  scopes: string[];
}): Promise<ResolvedClient> {
  const created = await prisma.oauthClient.create({
    data: {
      clientId: `sco_cid_${randomBytes(16).toString("base64url")}`,
      name: input.name,
      redirectUris: input.redirectUris,
      scopes: input.scopes,
      clientType: "public",
    },
  });
  return {
    rowId: created.id,
    clientId: created.clientId,
    name: created.name,
    redirectUris: created.redirectUris,
    scopes: created.scopes,
  };
}

/* --------------------------- the consent ticket --------------------------- */

// The consent screen POSTs its decision back to us. Rather than trusting the
// form fields (a cross-site POST could otherwise approve a grant on a signed-in
// person's behalf), the page hands out an HMAC-signed ticket that pins every
// parameter AND the human it was rendered for. The decide handler mints nothing
// unless the ticket verifies and belongs to the current session.

let warnedSecretFallback = false;

function consentSecret(): Buffer {
  const explicit = process.env.OAUTH_CONSENT_SECRET;
  const fallback = process.env.MCP_OAUTH_SECRET || process.env.CLERK_SECRET_KEY;
  const secret = explicit || fallback;
  if (!secret) throw new Error("OAUTH_CONSENT_SECRET (or MCP_OAUTH_SECRET) must be set for OAuth consent");
  if (!explicit && process.env.NODE_ENV === "production" && !warnedSecretFallback) {
    warnedSecretFallback = true;
    console.error(
      "[oauth] set OAUTH_CONSENT_SECRET so consent tickets do not share signing material with the MCP OAuth layer",
    );
  }
  return Buffer.from(secret, "utf8");
}

export interface ConsentTicket {
  /** users.id of the human the screen was rendered for. */
  userId: string;
  /** oauth_clients.id. */
  clientRowId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  state?: string;
  resource?: string;
  /** Epoch seconds. */
  exp: number;
}

export function signConsentTicket(ticket: Omit<ConsentTicket, "exp">, now = Date.now()): string {
  const payload: ConsentTicket = { ...ticket, exp: Math.floor(now / 1000) + CONSENT_TICKET_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", consentSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyConsentTicket(raw: string | null | undefined, now = Date.now()): ConsentTicket | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", consentSecret()).update(body).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConsentTicket;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < now) return null;
    if (!parsed.userId || !parsed.clientRowId || !parsed.redirectUri || !parsed.codeChallenge) return null;
    if (!Array.isArray(parsed.scopes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------ issuing codes ----------------------------- */

/**
 * Approve a consent screen: create the grant and its single-use code. Returns
 * the plaintext code, which is the only time it exists outside the redirect.
 */
export async function issueAuthorizationCode(input: {
  clientRowId: string;
  userId: string;
  accountId: string;
  scopes: string[];
  redirectUri: string;
  codeChallenge: string;
  resource?: string | null;
}): Promise<string> {
  const code = mintSecret(CODE_PREFIX);
  const grant = await prisma.oauthGrant.create({
    data: {
      clientRowId: input.clientRowId,
      userId: input.userId,
      accountId: input.accountId,
      scopes: input.scopes,
      redirectUri: input.redirectUri,
      resource: input.resource ?? null,
    },
  });
  await prisma.oauthAuthCode.create({
    data: {
      codeHash: hashSecret(code),
      grantId: grant.id,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scopes: input.scopes,
      resource: input.resource ?? null,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

/* ------------------------------- revocation ------------------------------- */

/** Kill a grant and everything it ever issued. Safe to call twice. */
export async function revokeGrant(grantId: string, reason: string): Promise<void> {
  await prisma.oauthGrant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  await prisma.oauthToken.updateMany({
    where: { grantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.oauthAuthCode.updateMany({
    where: { grantId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

/** Kill one rotation family, and the grant behind it. */
export async function revokeTokenFamily(familyId: string, grantId: string, reason: string): Promise<void> {
  await prisma.oauthToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await revokeGrant(grantId, reason);
}

/* ------------------------------ token issuing ----------------------------- */

export interface TokenSet {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokenPair(input: {
  grantId: string;
  familyId: string;
  scopes: string[];
  resource: string | null;
}): Promise<TokenSet> {
  const accessToken = mintSecret(ACCESS_PREFIX);
  const refreshToken = mintSecret(REFRESH_PREFIX);
  const now = Date.now();
  await prisma.oauthToken.createMany({
    data: [
      {
        grantId: input.grantId,
        kind: "access",
        tokenHash: hashSecret(accessToken),
        familyId: input.familyId,
        scopes: input.scopes,
        resource: input.resource,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
      {
        grantId: input.grantId,
        kind: "refresh",
        tokenHash: hashSecret(refreshToken),
        familyId: input.familyId,
        scopes: input.scopes,
        resource: input.resource,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    ],
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: formatScopes(input.scopes),
  };
}

/* ------------------------------ grant results ----------------------------- */

export type GrantResult =
  | { ok: true; tokens: TokenSet }
  | {
      ok: false;
      status: number;
      error: string;
      description?: string;
      /** Set when the failure was a replay we punished by revoking. */
      revoked?: "authorization_code_replay_revoked" | "refresh_token_replay_revoked";
      /** The scope set the revoked grant had held, so the client can record it. */
      scope?: string;
    };

function fail(error: string, description?: string, status = 400): GrantResult {
  return { ok: false, status, error, description };
}

/* -------------------------- authorization_code ---------------------------- */

export async function exchangeAuthorizationCode(input: {
  code: string | null;
  codeVerifier: string | null;
  clientId: string | null;
  redirectUri: string | null;
  resource: string | null;
}): Promise<GrantResult> {
  if (!input.code || !input.codeVerifier || !input.redirectUri) {
    return fail("invalid_request", "code, code_verifier and redirect_uri are required");
  }
  const client = await resolveClient(input.clientId);
  if (!client) return fail("invalid_client", "Unknown client_id");

  const record = await prisma.oauthAuthCode.findUnique({
    where: { codeHash: hashSecret(input.code) },
    include: { grant: true },
  });
  if (!record) return fail("invalid_grant", "Unknown or expired authorization code");

  // A code presented by a client it was not issued to is theft, not a typo.
  if (record.grant.clientRowId !== client.rowId) {
    await revokeGrant(record.grantId, "client_mismatch");
    return fail("invalid_grant", "Authorization code was not issued to this client");
  }

  // Replay: the code was already spent. Kill the grant and say so.
  if (record.consumedAt) {
    await revokeGrant(record.grantId, "code_replay");
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Authorization code replay detected; the grant has been revoked",
      revoked: "authorization_code_replay_revoked",
      scope: formatScopes(record.grant.scopes),
    };
  }

  if (record.grant.revokedAt) return fail("invalid_grant", "The grant was revoked");
  if (record.expiresAt.getTime() <= Date.now()) return fail("invalid_grant", "Authorization code expired");

  // Byte for byte, against the URI the code was bound to at authorize time.
  if (record.redirectUri !== input.redirectUri) return fail("invalid_grant", "redirect_uri mismatch");

  if (record.resource && input.resource && record.resource !== input.resource) {
    return fail("invalid_target", "resource does not match the one bound to this code");
  }

  if (!verifyPkceS256(input.codeVerifier, record.codeChallenge)) {
    return fail("invalid_grant", "PKCE verification failed");
  }

  // Single use, atomically: two simultaneous exchanges cannot both win, and the
  // loser is treated as the replay it is.
  const consumed = await prisma.oauthAuthCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    await revokeGrant(record.grantId, "code_replay");
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Authorization code replay detected; the grant has been revoked",
      revoked: "authorization_code_replay_revoked",
      scope: formatScopes(record.grant.scopes),
    };
  }

  const tokens = await issueTokenPair({
    grantId: record.grantId,
    familyId: record.id,
    scopes: record.scopes,
    resource: record.resource,
  });
  return { ok: true, tokens };
}

/* ----------------------------- refresh_token ------------------------------ */

export async function rotateRefreshToken(input: {
  refreshToken: string | null;
  clientId: string | null;
  resource: string | null;
}): Promise<GrantResult> {
  if (!input.refreshToken) return fail("invalid_request", "refresh_token is required");
  const client = await resolveClient(input.clientId);
  if (!client) return fail("invalid_client", "Unknown client_id");

  const record = await prisma.oauthToken.findUnique({
    where: { tokenHash: hashSecret(input.refreshToken) },
    include: { grant: true },
  });
  if (!record || record.kind !== "refresh") return fail("invalid_grant", "Unknown refresh token");
  if (record.grant.clientRowId !== client.rowId) {
    await revokeTokenFamily(record.familyId, record.grantId, "client_mismatch");
    return fail("invalid_grant", "Refresh token was not issued to this client");
  }

  // Replay: this token was already traded for its successor. Kill the family.
  if (record.rotatedAt) {
    await revokeTokenFamily(record.familyId, record.grantId, "refresh_replay");
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Refresh token replay detected; the token family has been revoked",
      revoked: "refresh_token_replay_revoked",
      scope: formatScopes(record.grant.scopes),
    };
  }

  if (record.revokedAt || record.grant.revokedAt) return fail("invalid_grant", "The grant was revoked");
  if (record.expiresAt.getTime() <= Date.now()) return fail("invalid_grant", "Refresh token expired");
  if (record.resource && input.resource && record.resource !== input.resource) {
    return fail("invalid_target", "resource does not match the one bound to this grant");
  }

  const rotated = await prisma.oauthToken.updateMany({
    where: { id: record.id, rotatedAt: null, revokedAt: null },
    data: { rotatedAt: new Date() },
  });
  if (rotated.count !== 1) {
    await revokeTokenFamily(record.familyId, record.grantId, "refresh_replay");
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Refresh token replay detected; the token family has been revoked",
      revoked: "refresh_token_replay_revoked",
      scope: formatScopes(record.grant.scopes),
    };
  }

  const tokens = await issueTokenPair({
    grantId: record.grantId,
    familyId: record.familyId,
    scopes: record.scopes,
    resource: record.resource,
  });
  return { ok: true, tokens };
}

/* ---------------------------- resource server ----------------------------- */

export interface OauthTokenContext {
  tokenId: string;
  grantId: string;
  /** users.id of the human who approved. */
  userId: string;
  /** users.id the token reads: the personal row or a workspace row. */
  accountId: string;
  scopes: string[];
  resource: string | null;
  clientId: string;
  clientName: string;
}

/** Is this string shaped like one of our access tokens? Cheap pre-filter so
 *  API-key traffic never touches the OAuth tables. */
export function looksLikeOauthAccessToken(token: string | null | undefined): boolean {
  return typeof token === "string" && token.startsWith(ACCESS_PREFIX);
}

/** Resolve a bearer access token, or null when it is unknown, expired, revoked
 *  or belongs to a revoked grant. */
export async function authenticateOauthAccessToken(token?: string | null): Promise<OauthTokenContext | null> {
  if (!looksLikeOauthAccessToken(token)) return null;
  const record = await prisma.oauthToken.findUnique({
    where: { tokenHash: hashSecret(token as string) },
    include: { grant: { include: { client: true } } },
  });
  if (!record || record.kind !== "access") return null;
  if (record.revokedAt || record.grant.revokedAt || record.grant.client.disabledAt) return null;
  if (record.grant.accountId !== record.grant.userId) {
    const membership = await prisma.teamMember.findUnique({
      where: { workspaceId_userId: { workspaceId: record.grant.accountId, userId: record.grant.userId } },
    });
    if (!membership) return null;
  }
  if (record.expiresAt.getTime() <= Date.now()) return null;

  // Best-effort usage stamp; never block the request on it.
  prisma.oauthToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    tokenId: record.id,
    grantId: record.grantId,
    userId: record.grant.userId,
    accountId: record.grant.accountId,
    scopes: record.scopes,
    resource: record.resource,
    clientId: record.grant.client.clientId,
    clientName: record.grant.client.name,
  };
}

export function hasScope(ctx: { scopes: string[] }, scope: string): boolean {
  return ctx.scopes.includes(scope);
}

export function hasAnyScope(ctx: { scopes: string[] }, scopes: string[]): boolean {
  return scopes.some((s) => ctx.scopes.includes(s));
}

/**
 * RFC 7009 revocation. Revokes the presented token and everything issued
 * alongside it. Silent by design: the caller answers 200 either way, so an
 * unknown token never becomes an oracle.
 */
export async function revokeByPresentedToken(token: string, clientId: string | null): Promise<void> {
  if (!token) return;
  const record = await prisma.oauthToken.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: { grant: { include: { client: true } } },
  });
  if (!record) return;
  // Only the client the token was issued to may revoke it.
  if (clientId && record.grant.client.clientId !== clientId) return;
  await revokeGrant(record.grantId, "revocation");
}
