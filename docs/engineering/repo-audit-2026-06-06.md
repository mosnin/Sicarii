# Repository & PR Audit — 2026-06-06

A point-in-time audit of the Scalar codebase (`main`) and the pull-request
history (#1–#18). Goal: surface security exposure, fragile operational
patterns, and process risk while the product is still small enough to fix them
cheaply. Findings are ranked; each names the evidence and a concrete fix.

---

## TL;DR

- **One critical hole:** the Exa monitor webhook (`/api/webhooks/exa`) accepts
  **unauthenticated, unsigned** POSTs that write records into a user's CRM. This
  is almost certainly the root cause of the "webhook flood incident" that PR #18
  is reacting to. **PR #18 caps the blast radius but does not close the hole.**
- **Operational fragility:** `prisma db push` runs on every production deploy,
  and several merged PRs shipped schema changes "owed to reality" as manual
  `ALTER TABLE` notes — one of which (`Entity.phone`, #15) took production down
  ("all tools failing," noted in #16).
- **Process:** 18 PRs landed in ~48h, single author, near-instant self-merge, no
  review cycle. Velocity is high; the safety net is thin. Both currently-open
  PRs (#3, #18) have **failing Vercel deployments**.

---

## 1. Security findings

### CRIT-1 — Exa webhook is unauthenticated and unsigned
**File:** `src/app/api/webhooks/exa/route.ts`

The handler reads `monitor_id` from the body, looks up the owning
`IntentMonitor` → `userId`, and — when `autoAdd` is set — calls
`extractAndAddToCrm(monitor.userId, items)`, writing entities/contacts straight
into that user's CRM. There is **no signature check, no shared secret, no bearer
token, and no rate limit**.

Contrast with `src/app/api/webhooks/clerk/route.ts`, which does it correctly:
svix signature verification (`wh.verify(...)`) plus a rate-limit guard. The Exa
webhook has neither.

**Impact:** anyone who learns or guesses an Exa `monitor_id` can inject
arbitrary records into a victim's CRM, or flood it to exhaustion. This matches
the symptom PR #18 describes (~20k records). PR #18's `checkCreationBudget` is
good defense-in-depth, but the front door is still open — a flood simply stops
at the cap instead of being rejected.

**Fix:** verify the request before trusting it. Options, best first:
1. Verify Exa's webhook signature if Exa provides one (check their monitor
   webhook docs for an HMAC header + signing secret).
2. Failing that, mint an unguessable per-monitor token, store it on
   `IntentMonitor`, register the webhook URL as
   `/api/webhooks/exa?t=<token>` (or a path segment), and reject on mismatch.
3. Add IP/rate limiting as a backstop, but it is not sufficient alone.

### HIGH-1 — In-memory rate limiter is a no-op on serverless
**File:** `src/lib/rate-limit.ts`

`checkRateLimit` stores counters in a module-level `Map` with a `setInterval`
sweeper. On Vercel, requests are spread across ephemeral isolates that don't
share memory, so the counter resets unpredictably and the limit is effectively
cosmetic. The file's own comment concedes this ("swap to @upstash/ratelimit").

This undermines every caller that relies on it for protection (e.g. the Clerk
webhook). PR #18's `creation-guard.ts` is the *correct* pattern — it counts real
DB rows, so it holds across instances. Rate limiting should move to the same
durable model (Upstash/Redis or a DB-backed counter).

### MED-1 — OAuth: no `redirect_uri` allow-listing
**Files:** `src/app/api/oauth/register/route.ts`, `src/app/api/oauth/authorize/route.ts`

Dynamic client registration echoes back any `redirect_uris` without storing
them, and `/authorize` accepts any syntactically-valid URL as `redirect_uri`
(`isValidUrl` only checks it parses). The authorization code is then redirected
there. PKCE (S256, enforced) + Clerk-bound identity substantially mitigate code
theft — an attacker who intercepts a code still lacks the verifier — but an
unconstrained `redirect_uri` on an authorization server is a phishing/redirection
surface that's avoidable. Bind the `redirect_uri` to the registered client and
re-check it at the token endpoint (the token route already checks
`claims.redirect_uri === redirectUri`, so registration-time pinning is the gap).

### MED-2 — OAuth signing secret falls back to `CLERK_SECRET_KEY`
**File:** `src/lib/oauth.ts` (`secret()`)

`MCP_OAUTH_SECRET || CLERK_SECRET_KEY` reuses Clerk's secret key to sign your
own access/refresh JWTs. Key reuse across trust domains means a leak of either
compromises both, and rotating Clerk's key silently invalidates all live MCP
tokens. Require a dedicated `MCP_OAUTH_SECRET` and fail closed if it's missing.

### LOW-1 — Wildcard CORS on OAuth endpoints
`Access-Control-Allow-Origin: *` on `/api/oauth/register` and `/token`. Standard
for a public-client token endpoint, noted for completeness. No action required
beyond awareness.

### Positives worth keeping
- API keys: high-entropy random, stored as SHA-256, shown once
  (`src/lib/api-auth.ts`). Unsalted SHA-256 is acceptable here because the
  tokens are not low-entropy passwords.
- MCP auth (`withMcpAuth`) cleanly accepts both API keys and OAuth tokens and
  injects a scoped `userId`; tools are all `userId`-scoped via `userIdFrom`.
- Clerk webhook verification is a correct reference implementation.

---

## 2. Operational fragility

### OPS-1 — `prisma db push` on every deploy
**File:** `package.json` → `"build": "prisma db push --skip-generate && next build"`

`db push` reconciles the live database to the schema with no migration history
and **can drop columns/data** on divergence. It also couples build success to DB
reachability. This is convenient for a solo prototype but is the mechanism
behind the migration pain below. Move to `prisma migrate deploy` with checked-in
migrations before this carries real customer data.

### OPS-2 — Schema changes shipped as manual SQL "owed to reality"
PRs #15 and #16 show the failure mode: #15 added `Entity.phone` and asked the
founder to run `ALTER TABLE "entities" ADD COLUMN ...` by hand; #16 then reports
production "all tools failing" because that column wasn't applied. With OPS-1
supposedly auto-pushing, the fact that it still broke means the deploy/push path
is not reliable. Pick one source of truth (migrations) and stop hand-editing
production schema.

### OPS-3 — Abandoned provider integrations accumulating
Synthoz was the core enrichment provider (#1, #7), hardened (#12), then ripped
out and replaced by Explorium/Pipe0/Exa/Bright Data/Linkup (#14–#17), with dead
Synthoz code "preserved." Carrying disconnected providers as dead code is a
maintenance and confusion tax (and a place for null-saving bugs to hide, several
of which #15 had to fix). Delete what's disconnected; git history is the archive.

---

## 3. Process & PR hygiene

- **18 PRs in ~48h, single author, self-merged within seconds/minutes** of
  opening (`created_at` ≈ `merged_at` across the board). No second-set-of-eyes
  review. The CRIT/HIGH issues above are exactly what review catches.
- **Open PRs are both red:**
  - **#18** (creation circuit breaker) — draft, Vercel deploy **failing**. The
    change itself is sound; it should be paired with CRIT-1's fix so the webhook
    is *rejected*, not merely capped. Resolve the failing deploy before merge.
  - **#3** (`supabase-setup.sql`) — draft since Jun 5, Vercel **failing**, and
    likely **redundant**: the build's `prisma db push` already provisions the
    schema, and `schema.prisma` is the stated source of truth. Recommend closing
    unless there's a deliberate "paste into SQL editor" workflow to keep.
- **PR descriptions are excellent** — they consistently state what/why, the
  required migration, and a test plan. Keep that. The gap is verification depth:
  descriptions assert "typecheck + lint pass" but the deploys that would prove it
  are failing on the open PRs.

---

## 4. Recommended order of operations

1. **Close CRIT-1** — authenticate the Exa webhook. Highest exposure, small diff.
2. **Land #18** alongside it (cap + reject together), once its deploy is green.
3. **Fix the deploys** on #3/#18 or close #3.
4. **OPS-1/OPS-2** — switch to `prisma migrate deploy`; stop manual schema edits.
5. **HIGH-1** — move rate limiting to the durable (DB/Redis) model #18 already
   demonstrates.
6. **MED-1/MED-2** — pin OAuth `redirect_uri`; require a dedicated signing secret.
7. **OPS-3** — delete disconnected provider code.

---

_Scope: static review of `main` plus the GitHub PR record. No runtime/pentest
was performed; severities are pre-exploitation estimates. CRIT-1 in particular
should be confirmed against Exa's webhook-auth capabilities before choosing a
fix._
