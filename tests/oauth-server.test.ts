// The OAuth 2.1 authorization server (/oauth/*). These are the security
// properties that must never regress:
//   1. PKCE S256 is verified, and a wrong verifier buys nothing.
//   2. An authorization code is single use; replaying one revokes the grant.
//   3. Refresh tokens rotate on every use.
//   4. Replaying a rotated refresh token revokes the whole family.
//   5. redirect_uri is matched byte for byte at the token endpoint too.
//   6. Revocation is idempotent and always answers 200 (RFC 7009).
//   7. userinfo refuses a missing, revoked or under-scoped token.
//
// Prisma is faked in memory so the suite runs with no database, the same way
// tests/oauth-rotation.test.ts fakes the revoked-token table.

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";

/* ---------------------------- in-memory Prisma ---------------------------- */

type Row = Record<string, unknown>;

const store: Record<string, Row[]> = {
  oauthClient: [],
  oauthGrant: [],
  oauthAuthCode: [],
  oauthToken: [],
  user: [],
  teamMember: [],
};

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === null) return row[key] === null || row[key] === undefined;
    return row[key] === value;
  });
}

function table(name: string) {
  const rows = () => store[name];
  return {
    findUnique: vi.fn(async ({ where, include }: { where: Row; include?: Row }) => {
      // Compound unique keys arrive as a single nested object.
      const flat: Row = {};
      for (const [key, value] of Object.entries(where)) {
        if (value && typeof value === "object") Object.assign(flat, value as Row);
        else flat[key] = value;
      }
      const row = rows().find((r) => matches(r, flat));
      if (!row) return null;
      return include ? hydrate(row, include) : { ...row };
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row: Row = {
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        disabledAt: null,
        revokedAt: null,
        revokedReason: null,
        consumedAt: null,
        rotatedAt: null,
        lastUsedAt: null,
        resource: null,
        ...data,
      };
      rows().push(row);
      return { ...row };
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const item of data) {
        rows().push({
          id: randomUUID(),
          createdAt: new Date(),
          revokedAt: null,
          rotatedAt: null,
          lastUsedAt: null,
          resource: null,
          ...item,
        });
      }
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows().find((r) => matches(r, where));
      if (row) Object.assign(row, data);
      return row ? { ...row } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hits = rows().filter((r) => matches(r, where));
      for (const row of hits) Object.assign(row, data);
      return { count: hits.length };
    }),
  };
}

function hydrate(row: Row, include: Row): Row {
  const out: Row = { ...row };
  if (include.grant) {
    const grant = store.oauthGrant.find((g) => g.id === row.grantId);
    if (grant) {
      const nested = (include.grant as Row)?.include as Row | undefined;
      out.grant = nested?.client
        ? { ...grant, client: { ...store.oauthClient.find((c) => c.id === grant.clientRowId) } }
        : { ...grant };
    }
  }
  return out;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oauthClient: table("oauthClient"),
    oauthGrant: table("oauthGrant"),
    oauthAuthCode: table("oauthAuthCode"),
    oauthToken: table("oauthToken"),
    user: table("user"),
    teamMember: table("teamMember"),
    apiKey: table("apiKey"),
  },
}));

import {
  AUTH_CODE_TTL_SECONDS,
  exchangeAuthorizationCode,
  hashSecret,
  issueAuthorizationCode,
  matchRedirectUri,
  narrowScopes,
  registerClient,
  revokeByPresentedToken,
  rotateRefreshToken,
  signConsentTicket,
  verifyConsentTicket,
  verifyPkceS256,
} from "@/lib/oauth-server";
import { POST as revokeRoute } from "@/app/oauth/revoke/route";
import { GET as userinfoRoute } from "@/app/oauth/userinfo/route";

/* --------------------------------- fixtures -------------------------------- */

const REDIRECT_URI = "https://client.example.com/callback";
const VERIFIER = "a".repeat(64);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

async function seedClient(scopes = ["openid", "profile", "crm:read"]) {
  return registerClient({ name: "Test client", redirectUris: [REDIRECT_URI], scopes });
}

async function seedUser() {
  const id = randomUUID();
  store.user.push({
    id,
    clerkId: `user_${id}`,
    email: "ana@example.com",
    firstName: "Ana",
    lastName: "Ruiz",
    imageUrl: null,
    accountType: "user",
    updatedAt: new Date(),
  });
  return id;
}

async function approvedCode(opts?: { scopes?: string[]; clientScopes?: string[] }) {
  const client = await seedClient(opts?.clientScopes);
  const userId = await seedUser();
  const scopes = opts?.scopes ?? ["openid", "profile", "crm:read"];
  const code = await issueAuthorizationCode({
    clientRowId: client.rowId,
    userId,
    accountId: userId,
    scopes,
    redirectUri: REDIRECT_URI,
    codeChallenge: CHALLENGE,
    resource: null,
  });
  return { client, userId, code, scopes };
}

function form(fields: Record<string, string>): Request {
  return new Request("https://tryscalar.xyz/oauth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

beforeAll(() => vi.stubEnv("OAUTH_CONSENT_SECRET", "consent-test-secret"));
afterAll(() => vi.unstubAllEnvs());

beforeEach(() => {
  for (const key of Object.keys(store)) store[key] = [];
});

/* ---------------------------------- tests ---------------------------------- */

describe("PKCE S256", () => {
  it("accepts the matching verifier and refuses everything else", () => {
    expect(verifyPkceS256(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkceS256("b".repeat(64), CHALLENGE)).toBe(false);
    expect(verifyPkceS256(VERIFIER, "not-a-challenge")).toBe(false);
    expect(verifyPkceS256("", CHALLENGE)).toBe(false);
    // Too short / too long verifiers are out of spec and refused.
    expect(verifyPkceS256("short", CHALLENGE)).toBe(false);
    expect(verifyPkceS256("a".repeat(200), CHALLENGE)).toBe(false);
  });

  it("refuses a plain-style challenge (the verifier used as its own challenge)", () => {
    expect(verifyPkceS256(VERIFIER, VERIFIER)).toBe(false);
  });

  it("refuses the exchange when the verifier does not match, and keeps the code unspent", async () => {
    const { client, code } = await approvedCode();

    const wrong = await exchangeAuthorizationCode({
      code,
      codeVerifier: "b".repeat(64),
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(wrong.ok).toBe(false);
    if (wrong.ok) return;
    expect(wrong.error).toBe("invalid_grant");
    expect(wrong.revoked).toBeUndefined();

    // The legitimate client, holding the real verifier, still succeeds.
    const right = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(right.ok).toBe(true);
  });
});

describe("redirect_uri matching", () => {
  it("matches byte for byte, never by prefix or trailing slash", () => {
    const registered = [REDIRECT_URI];
    expect(matchRedirectUri(registered, REDIRECT_URI)).toBe(true);
    expect(matchRedirectUri(registered, `${REDIRECT_URI}/`)).toBe(false);
    expect(matchRedirectUri(registered, `${REDIRECT_URI}?x=1`)).toBe(false);
    expect(matchRedirectUri(registered, "https://client.example.com.evil.test/callback")).toBe(false);
    expect(matchRedirectUri(registered, null)).toBe(false);
  });

  it("refuses the exchange when the redirect_uri differs from the bound one", async () => {
    const { client, code } = await approvedCode();
    const result = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: "https://client.example.com/callback2",
      resource: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_grant");
    expect(result.description).toMatch(/redirect_uri/);
  });
});

describe("authorization code", () => {
  it("issues a token pair once and revokes the grant when the code is replayed", async () => {
    const { client, code, scopes } = await approvedCode();

    const first = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.tokens.token_type).toBe("Bearer");
    expect(first.tokens.expires_in).toBeGreaterThan(0);
    expect(first.tokens.expires_in).toBeLessThanOrEqual(86400);
    expect(first.tokens.scope).toBe(scopes.join(" "));
    expect(first.tokens.refresh_token).toBeTruthy();

    const replay = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.status).toBe(400);
    expect(replay.error).toBe("invalid_grant");
    expect(replay.revoked).toBe("authorization_code_replay_revoked");

    // Every token the grant produced is dead, so the leaked code bought nothing.
    const refreshAfter = await rotateRefreshToken({
      refreshToken: first.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(refreshAfter.ok).toBe(false);
  });

  it("stores the code only as a hash", async () => {
    const { code } = await approvedCode();
    const stored = store.oauthAuthCode[0];
    expect(stored.codeHash).toBe(hashSecret(code));
    expect(JSON.stringify(store.oauthAuthCode)).not.toContain(code);
  });

  it("refuses an expired code", async () => {
    const { client, code } = await approvedCode();
    const stored = store.oauthAuthCode[0];
    stored.expiresAt = new Date(Date.now() - AUTH_CODE_TTL_SECONDS * 1000);
    const result = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.description).toMatch(/expired/i);
  });

  it("refuses a code presented by a different client", async () => {
    const { code } = await approvedCode();
    const other = await seedClient();
    const result = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: other.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("refresh token rotation", () => {
  it("hands back a new refresh token and retires the old one", async () => {
    const { client, code } = await approvedCode();
    const first = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const rotated = await rotateRefreshToken({
      refreshToken: first.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.tokens.refresh_token).not.toBe(first.tokens.refresh_token);
    expect(rotated.tokens.access_token).not.toBe(first.tokens.access_token);
    expect(rotated.tokens.scope).toBe(first.tokens.scope);

    // The successor keeps working: rotation is not a one shot.
    const again = await rotateRefreshToken({
      refreshToken: rotated.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(again.ok).toBe(true);
  });

  it("revokes the whole family when a rotated refresh token is replayed", async () => {
    const { client, code, scopes } = await approvedCode();
    const first = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    if (!first.ok) throw new Error("expected the first exchange to succeed");

    const rotated = await rotateRefreshToken({
      refreshToken: first.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    if (!rotated.ok) throw new Error("expected rotation to succeed");

    // The thief presents the token the legitimate client already rotated past.
    const replay = await rotateRefreshToken({
      refreshToken: first.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.status).toBe(400);
    expect(replay.error).toBe("invalid_grant");
    expect(replay.revoked).toBe("refresh_token_replay_revoked");
    expect(replay.scope).toBe(scopes.join(" "));

    // And the successor the legitimate client holds is dead too: the family is
    // gone, so the person reconnects instead of sharing a line with a thief.
    const successor = await rotateRefreshToken({
      refreshToken: rotated.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(successor.ok).toBe(false);
  });

  it("stores refresh tokens only as hashes", async () => {
    const { client, code } = await approvedCode();
    const first = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    if (!first.ok) throw new Error("expected the exchange to succeed");
    const serialized = JSON.stringify(store.oauthToken);
    expect(serialized).not.toContain(first.tokens.access_token);
    expect(serialized).not.toContain(first.tokens.refresh_token);
    expect(store.oauthToken.some((t) => t.tokenHash === hashSecret(first.tokens.access_token))).toBe(true);
  });
});

describe("revocation", () => {
  it("answers 200 with an empty body, twice, and for a token that never existed", async () => {
    const { client, code } = await approvedCode();
    const first = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    if (!first.ok) throw new Error("expected the exchange to succeed");

    const one = await revokeRoute(form({ client_id: client.clientId, token: first.tokens.refresh_token }));
    expect(one.status).toBe(200);
    expect(await one.text()).toBe("");

    const two = await revokeRoute(form({ client_id: client.clientId, token: first.tokens.refresh_token }));
    expect(two.status).toBe(200);

    const unknown = await revokeRoute(form({ client_id: client.clientId, token: "sco_rt_nope" }));
    expect(unknown.status).toBe(200);

    // Revoking the refresh token takes the access token with it.
    const after = await rotateRefreshToken({
      refreshToken: first.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(after.ok).toBe(false);
  });

  it("ignores a revocation from a client the token was not issued to", async () => {
    const { client, code } = await approvedCode();
    const first = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    if (!first.ok) throw new Error("expected the exchange to succeed");
    const other = await seedClient();

    await revokeByPresentedToken(first.tokens.refresh_token, other.clientId);
    const stillWorks = await rotateRefreshToken({
      refreshToken: first.tokens.refresh_token,
      clientId: client.clientId,
      resource: null,
    });
    expect(stillWorks.ok).toBe(true);
  });
});

describe("userinfo", () => {
  function bearer(token?: string): Request {
    return new Request("https://tryscalar.xyz/oauth/userinfo", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  async function accessTokenWith(scopes: string[]) {
    const { client, code } = await approvedCode({ scopes, clientScopes: scopes });
    const result = await exchangeAuthorizationCode({
      code,
      codeVerifier: VERIFIER,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      resource: null,
    });
    if (!result.ok) throw new Error("expected the exchange to succeed");
    return { token: result.tokens.access_token, client };
  }

  it("refuses a request with no bearer token", async () => {
    const res = await userinfoRoute(bearer());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("invalid_token");
  });

  it("refuses an unknown token", async () => {
    const res = await userinfoRoute(bearer("sco_at_definitely-not-real"));
    expect(res.status).toBe(401);
  });

  it("returns standard claims plus the workspace the token reads", async () => {
    const { token, client } = await accessTokenWith(["openid", "profile", "email"]);
    const res = await userinfoRoute(bearer(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sub).toBe(store.user[0].id);
    expect(body.name).toBe("Ana Ruiz");
    expect(body.email).toBe("ana@example.com");
    expect(body.client_id).toBe(client.clientId);
    expect(body.workspace).toMatchObject({ id: store.user[0].id, type: "personal", role: "owner" });
  });

  it("omits email when the token was not granted the email scope", async () => {
    const { token } = await accessTokenWith(["openid", "profile"]);
    const res = await userinfoRoute(bearer(token));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.email).toBeUndefined();
    expect(body.name).toBe("Ana Ruiz");
  });

  it("refuses a token that holds neither openid nor profile", async () => {
    const { token } = await accessTokenWith(["crm:read"]);
    const res = await userinfoRoute(bearer(token));
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("insufficient_scope");
  });

  it("refuses a token whose grant was revoked", async () => {
    const { token, client } = await accessTokenWith(["openid", "profile"]);
    await revokeRoute(form({ client_id: client.clientId, token }));
    const res = await userinfoRoute(bearer(token));
    expect(res.status).toBe(401);
  });
});

describe("scopes", () => {
  it("never grants a scope the client is not allowed, or one this server does not know", () => {
    expect(narrowScopes(["openid", "crm:write", "admin"], ["openid", "crm:read"])).toEqual(["openid"]);
    expect(narrowScopes(["not-a-scope"], ["openid"])).toEqual([]);
  });
});

describe("consent ticket", () => {
  const ticket = {
    userId: "usr_1",
    clientRowId: "cli_1",
    redirectUri: REDIRECT_URI,
    scopes: ["openid"],
    codeChallenge: CHALLENGE,
    state: "xyz",
  };

  it("round-trips a ticket it signed", () => {
    const signed = signConsentTicket(ticket);
    expect(verifyConsentTicket(signed)).toMatchObject(ticket);
  });

  it("refuses a tampered or forged ticket", () => {
    const signed = signConsentTicket(ticket);
    const [body, sig] = signed.split(".");
    const tampered = `${Buffer.from(
      JSON.stringify({ ...ticket, userId: "usr_2", exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString("base64url")}.${sig}`;
    expect(verifyConsentTicket(tampered)).toBeNull();
    expect(verifyConsentTicket(`${body}.deadbeef`)).toBeNull();
    expect(verifyConsentTicket("garbage")).toBeNull();
    expect(verifyConsentTicket(null)).toBeNull();
  });

  it("refuses an expired ticket", () => {
    const signed = signConsentTicket(ticket, Date.now() - 60 * 60 * 1000);
    expect(verifyConsentTicket(signed)).toBeNull();
  });
});
