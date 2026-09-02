# OAuth 2.1 at Scalar

Status: shipped. Owner: the engineer. Last updated 2026-09-02.

Scalar is its own authorization server. An external app (an MCP client, an agent
runtime, a partner integration) sends a person here, they sign in with the Clerk
session they already have, they approve a named set of scopes for a named
account, and the app walks away with an access token and a refresh token.

Everything lives under `/oauth/*`. Discovery is at the standard well known
paths, so a client that speaks RFC 8414 needs nothing but the origin.

---

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/.well-known/oauth-authorization-server` | RFC 8414 metadata. Rewritten to `/oauth/metadata/authorization-server`. |
| `GET` | `/.well-known/oauth-protected-resource` | RFC 9728 metadata for the MCP resource. Rewritten to `/oauth/metadata/protected-resource`. |
| `GET` | `/oauth/authorize` | The consent screen. A page, not an API. |
| `POST` | `/oauth/authorize/decide` | Where the consent screen posts approve or deny. Not called directly. |
| `POST` | `/oauth/token` | `authorization_code` and `refresh_token` grants. Form encoded. |
| `POST` | `/oauth/revoke` | RFC 7009 revocation. Form encoded. Always 200. |
| `GET` | `/oauth/userinfo` | OIDC style claims for the bearer's subject. |
| `POST` | `/oauth/register` | RFC 7591 dynamic client registration for public PKCE clients. |

### `GET /oauth/authorize`

Query parameters:

| Parameter | Value |
| --- | --- |
| `response_type` | `code` (the only supported value) |
| `client_id` | the identifier from registration |
| `redirect_uri` | must match a registered URI byte for byte |
| `scope` | space separated, see below |
| `state` | opaque, echoed back unchanged |
| `code_challenge` | base64url SHA-256 of the verifier |
| `code_challenge_method` | `S256`. `plain` is refused. |
| `resource` | optional RFC 8707 indicator, bound to the code when sent |

Behaviour:

- A signed out visitor is sent to `/sign-in` and comes back to the same URL with
  its query intact, so the authorization request survives the login.
- An unknown `client_id` or an unregistered `redirect_uri` renders an error page.
  Nothing is ever redirected to an address the client did not register, and there
  is no fallback to a default URI.
- Protocol errors found after the redirect URI is trusted (a bad
  `response_type`, a missing challenge, `code_challenge_method=plain`, a scope
  the client may not have) go back to the client as `error` plus `state`.
- The screen names the client, lists each scope in plain words, and lets the
  person choose which account they are exposing: their personal account, or a
  team workspace they belong to. The grant is bound to that choice.
- Approving posts an HMAC signed consent ticket back to
  `/oauth/authorize/decide`, which mints the code server side. The ticket pins
  every parameter and the human it was rendered for, so a cross site POST cannot
  approve a grant on a signed in person's behalf.
- Denying redirects with `error=access_denied` and `state`.
- The code is single use, lives ten minutes, and is bound to the client, the
  redirect URI, the PKCE challenge, the resource and the chosen account.

### `POST /oauth/token`

`application/x-www-form-urlencoded`.

```
grant_type=authorization_code
code=<the code>
code_verifier=<43..128 characters>
client_id=<client id>
redirect_uri=<the same URI, byte for byte>
resource=<the same resource, when one was sent>
```

```
grant_type=refresh_token
refresh_token=<the token>
client_id=<client id>
```

Success is 200 with:

```json
{
  "access_token": "sco_at_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "sco_rt_...",
  "scope": "openid profile crm:read"
}
```

Access tokens live one hour, refresh tokens thirty days, and every refresh
returns a new refresh token. A refresh that handed back the same token forever
could not tell a theft from ordinary use.

**Replay is a security event, not an error.** Both cases answer HTTP 400:

- An authorization code presented twice revokes the whole grant, which kills
  every token it issued:

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code replay detected; the grant has been revoked",
  "grant_revoked": true,
  "recovery_status": "authorization_code_replay_revoked",
  "scope": "openid profile crm:read"
}
```

- A rotated refresh token presented again revokes the whole rotation family,
  including the successor the legitimate client is holding, so a thief and the
  real client cannot share a line:

```json
{
  "error": "invalid_grant",
  "error_description": "Refresh token replay detected; the token family has been revoked",
  "grant_revoked": true,
  "recovery_status": "refresh_token_replay_revoked",
  "scope": "openid profile crm:read"
}
```

`error` and `error_description` are the standard RFC 6749 members; the other
three are extras a client may use to prove to itself that the leaked credential
is dead and to record what the revoked grant had held. Any other 400 is an
ordinary failure.

### `POST /oauth/revoke`

`client_id` and `token`, form encoded. Revokes the token and everything issued
alongside it, and answers **200 with an empty body** whether or not the token
existed, per RFC 7009. An unknown token is never an oracle, and a disconnect
never fails because it already happened. A revocation presented by a client the
token was not issued to is ignored, and still answers 200.

### `GET /oauth/userinfo`

`Authorization: Bearer <access token>`. Requires `openid` or `profile`; a valid
token holding neither gets 403 `insufficient_scope`. A missing, expired or
revoked token gets 401 with a `WWW-Authenticate` header.

```json
{
  "sub": "6f1c...",
  "name": "Ana Ruiz",
  "given_name": "Ana",
  "family_name": "Ruiz",
  "picture": "https://img.clerk.com/...",
  "updated_at": 1756852800,
  "email": "ana@example.com",
  "workspace": { "id": "9b2e...", "name": "Ruiz Dental", "type": "workspace", "role": "admin" },
  "scope": "openid profile email",
  "client_id": "sco_cid_..."
}
```

- `sub` is the Scalar `users.id` of the human who approved. It is stable
  forever: not the Clerk id, which can be re-pointed, and not the email, which
  changes.
- `email` is present only with the `email` scope; the profile claims only with
  `profile`.
- `workspace` is a Scalar claim, not a standard one. It names the account the
  token actually reads, which for a team member is the shared workspace row
  rather than their personal one, plus their role in it. `type` is `personal` or
  `workspace`.

Scalar does not issue `id_token`s, so there is no `jwks_uri` and this is not a
full OpenID Connect provider. `openid` here means "may call userinfo".

---

## Scopes

| Scope | What it grants |
| --- | --- |
| `openid` | Confirm which Scalar account you are |
| `profile` | See your name, picture and workspace |
| `email` | See your email address |
| `crm:read` | Read your contacts, companies, activities and pipelines |
| `crm:write` | Create and update records in your CRM |
| `mcp` | Run Scalar's agent tools on your behalf, over `/api/mcp` |

A client asking for nothing gets `openid profile crm:read`. A client can never
be granted a scope outside the set it registered, and an unknown scope is
dropped rather than granted. Scope is enforced at each endpoint, not only at
issue time.

---

## Security properties

- **PKCE S256 is mandatory.** `plain` is refused at the authorize endpoint. The
  verifier is checked with a constant-time compare over the raw digests, so a
  wrong verifier leaks nothing through response timing.
- **Redirect URIs match byte for byte** at authorize and again at token. No
  prefix matching, no trailing slash tolerance, no default fallback.
- **Codes are single use for ten minutes**, consumed by a guarded update, so two
  simultaneous exchanges cannot both win and the loser is treated as the replay
  it is.
- **Refresh tokens rotate on every use**, and replaying a rotated one revokes
  the family.
- **Nothing is stored raw.** Codes, access tokens and refresh tokens are written
  down only as SHA-256 hashes, the same posture as `ApiKey.hashedKey`. A dump of
  the database yields nothing a client could present.
- **Consent cannot be forged.** The decision endpoint mints nothing without a
  valid HMAC ticket belonging to the current session, and the account being
  exposed is re-checked against `TeamMember` before the grant is written.
- The token, revoke and register endpoints are rate limited per IP.

---

## Storage

Four tables, in `prisma/schema.prisma`:

| Model | Table | Holds |
| --- | --- | --- |
| `OauthClient` | `oauth_clients` | client id, display name, registered redirect URIs, allowed scopes |
| `OauthGrant` | `oauth_grants` | one person's approval of one client for one account, plus revocation state |
| `OauthAuthCode` | `oauth_auth_codes` | the code hash, challenge, bound redirect URI and resource, expiry, consumption |
| `OauthToken` | `oauth_tokens` | access and refresh token hashes, rotation family, expiry, rotation and revocation |

Schema changes ship the way every other one here does: `pnpm build` runs
`prisma db push`, so the tables appear on deploy. There is no migration file to
apply by hand.

---

## Environment variables

| Variable | Required | What it is for |
| --- | --- | --- |
| `OAUTH_CONSENT_SECRET` | recommended | Signs the consent tickets the authorize page hands to `/oauth/authorize/decide`. Falls back to `MCP_OAUTH_SECRET`, then `CLERK_SECRET_KEY`. Generate with `openssl rand -hex 32`. |
| `MCP_OAUTH_SECRET` | recommended | Signing material for the older stateless MCP OAuth layer, and the fallback above. |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | The session behind the consent screen. |
| `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` | yes | Where clients, grants, codes and tokens live. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | in production | Durable rate limiting for the token, revoke and register endpoints. Without them the limits are per serverless instance. |

`pnpm doctor` reports on all of these.

---

## Registering a client

Either register dynamically:

```bash
curl -sX POST https://www.tryscalar.xyz/oauth/register \
  -H 'content-type: application/json' \
  -d '{
        "client_name": "Acme Agent",
        "redirect_uris": ["https://acme.example.com/oauth/callback"],
        "scope": "openid profile crm:read"
      }'
```

The response carries the `client_id`. There is no client secret: these are
public clients, and PKCE is what secures the exchange. Redirect URIs must be
`https`, or `http` on `localhost` / `127.0.0.1` for local development. At most
ten per client, and each is matched byte for byte later, so register the exact
string the client will send.

Registering grants nothing on its own. A client cannot read a byte until a
person approves it on the consent screen.

Or seed a row directly, which is the right move for a partner whose name and
scopes you want to control:

```ts
import { registerClient } from "@/lib/oauth-server";

await registerClient({
  name: "Acme Agent",
  redirectUris: ["https://acme.example.com/oauth/callback"],
  scopes: ["openid", "profile", "crm:read"],
});
```

To take a client out of service, set `disabledAt` on its `oauth_clients` row:
`resolveClient` then refuses it, and no new code or token is issued. Existing
grants are revoked one at a time through `/oauth/revoke`.

---

## The older `/api/oauth/*` layer

Before this server there was a stateless one under `/api/oauth/*`: signed JWT
codes and tokens, and a signed `client_id` that carried its redirect URIs inside
it. Those routes still answer, so tokens already in the wild keep working, but
the discovery metadata now points at `/oauth/*` and new clients land here.

Two bridges keep the seam invisible:

- A legacy signed `client_id` presented at `/oauth/authorize` is verified and
  materialised as a real `oauth_clients` row the first time it shows up, with the
  redirect URIs that were signed into it. Only ids this deployment signed can
  verify, so this cannot be used to plant a client.
- `/api/mcp` accepts an access token from either server. A token from this one
  needs the `mcp` scope, and it operates the account the grant is bound to, so a
  team member's token drives the shared workspace CRM exactly as their session
  would.

---

## Tests

`tests/oauth-server.test.ts` (`pnpm test`) covers the properties above against
an in-memory Prisma: PKCE mismatch refused, plain-style challenge refused, code
replay revoking the grant, rotation, refresh replay revoking the family,
`redirect_uri` mismatch refused, revocation idempotence, userinfo refusing a
missing, unknown, revoked or under-scoped token, and the consent ticket refusing
forgery, tampering and expiry.
