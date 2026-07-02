# World-Class Engineering Plan - 2026-07-02

> The synthesis of four parallel audits (OWASP security, backend structure,
> performance, live Playwright UI) into one prioritized trajectory. Wave 1
> shipped in PR #31 (merged); wave 2 ships with this doc. What remains is
> listed with owners. Status: living plan, update as items land.

## How the backend is actually structured (the lever and the fulcrum)

One spine: **`src/lib/crm-operations.ts` is the single ops layer**. REST routes,
the MCP server (35+ tools), and the in-app agent all call the same functions,
so ownership checks and metering live in exactly one place. That is the
product's structural advantage: fix a function once and every surface
(UI, REST, MCP, agent) inherits it.

- **Auth**: Clerk sessions (UI) + hashed API keys (`scl_`) + OAuth 2.1 PKCE
  JWTs (MCP), all resolving to one `userId`. Middleware = `src/proxy.ts`.
- **Metering**: `src/lib/credits.ts`, atomic conditional decrement, gate
  before paid work, debit only on hit. GREATEST-based refills (never wipe
  purchased credits).
- **Payments**: Stripe webhooks (HMAC verified, ProcessedEvent idempotency)
  + x402 USDC (nonce-keyed idempotency).
- **Data**: Prisma 6 on Supabase Postgres + pgvector; every table scoped by
  `userId` with FK cascades.
- **Egress**: provider libs in `src/lib/*` (Exa, Explorium, Apify, ...) with
  timeouts; SSRF-guarded outbound webhooks.

## Shipped - wave 1 (PR #31, merged)

| # | Fix | Class |
|---|---|---|
| 1 | `applyPlan` + both Stripe handlers use GREATEST, never wipe top-ups | P0 money |
| 2 | x402 `paymentRef` returns null on missing nonce; all callers reject early | P0 money |
| 3 | SSRF: IPv4-mapped IPv6 (`::ffff:127.0.0.1`) blocked; webhooks HTTPS-only | P1 security |
| 4 | Prompt-injection delimiters in fit-score, semantic-sort, agent context | P1 security |
| 5 | PII response bodies removed from all 7 provider logs | P1 data leak |
| 6 | CSP: Google Fonts unblocked (brand font!), UploadThing + Stripe added | P1 UX/security |
| 7 | Indexes: `Entity(userId, domain)`, `PipelineEntry(pipelineId, stage)` | P2 perf |
| 8 | LCP: logo `priority` in both headers | P2 perf |
| 9 | `/product/(.*)` added to public routes (marketing pages hit login wall) | P0 UX |

## Shipped - wave 2 (this change)

| # | Fix | Class |
|---|---|---|
| 10 | DNS-rebinding defense: webhook hostnames resolved, private IPs refused | P1 security |
| 11 | Batched inserts (`createManyAndReturn`) in findCompanies + discoverLocalLeads: one INSERT instead of N | P2 perf |
| 12 | `getEntity` contacts capped at 100 | P2 perf |
| 13 | Rate limits: /api/search (120/min), segment + pipeline creation (30/min) | P2 security |
| 14 | Clerk `user.deleted` no longer swallows failures; 500 makes Clerk retry (compliance) | P1 correctness |
| 15 | Segment + Pipeline get real FK cascades to User (orphan risk closed at the DB) | P1 correctness |
| 16 | Enrichment blobs omitted from ALL list surfaces (MCP tools, REST lists, CRM pages): detail routes keep them | P2 perf + leak surface |
| 17 | `MCP_OAUTH_SECRET` fallback now logs a SECURITY error in production; documented in .env.local.example with INNGEST_SIGNING_KEY + CRON_SECRET | P1 security |

## Owed - founder actions (cannot be done from code)

1. **`prisma db push`** against prod: new indexes, Segment/Pipeline FKs, and
   the wave-0 columns (lastContactedAt, activities, processed_events,
   contact_calls, agentPhoneApiKey).
2. **Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`** in Vercel.
   Without them every rate limit is per-serverless-instance = effectively off.
   This is the single highest-leverage security env var.
3. **Set `MCP_OAUTH_SECRET`** (openssl rand -hex 32). Until then OAuth tokens
   are signed with `CLERK_SECRET_KEY` (one secret, two security contexts).
4. **Set `INNGEST_SIGNING_KEY`** so the public /api/inngest route rejects
   forged invocations.
5. **Rotate the Supabase PAT** shared in chat (sbp_...).
6. **Founder Call - pricing**: `business` = 8,000 credits at $99 while `pro`
   = 12,000 at $129. If business is meant to be the bigger plan, its credits
   are wrong; if it's a mid tier, the name misleads. Decide and we fix PLANS.

## Next cycles - designed, not yet built

Ordered by leverage per unit of work:

1. **OAuth refresh-token rotation + revocation table.** Stateless 30-day
   refresh JWTs cannot be revoked today. Add a `RevokedToken` (jti) table +
   rotate-on-use. Small table, checked only on refresh, zero hot-path cost.
2. **Nonce-based CSP** (drop `unsafe-eval`/`unsafe-inline`). Requires
   middleware nonce injection; verify Clerk compatibility first. This is the
   last big XSS-hardening step.
3. **Encrypt `agentMailApiKey`/`agentPhoneApiKey` at rest** (AES-GCM with a
   KMS-style env key). Today they're plaintext columns; a DB breach exposes
   users' third-party keys.
4. **`prisma migrate deploy` instead of `db push` in the build.** db push on
   every production build can drop columns on schema divergence. Adopt
   migrations once the open schema wave lands.
5. **pgvector index on memory_chunks** (HNSW, vector_cosine_ops) + a per-user
   row cap. Recall currently seq-scans each user's chunks.
6. **Credit metering on /api/discover tool branches** (find-entities,
   deep-research, company-funding call paid providers uncharged from the UI).
   Founder call: UI research may be intentionally free; decide, then meter.
7. **Exa webhook: per-request HMAC of body** instead of a static URL token.
8. **maybeReset single-query fold** (SQL CASE on plan) to shave one round
   trip off every metered action - do it when metered QPS makes it matter.

## Intentionally NOT changed

- **Welcome orchestrator enrichment stays sequential.** The perf audit
  flagged it, but one-at-a-time is the choreography of Moment 1 (the CRM
  building itself live). Speed would kill the felt experience. Vision breaks
  the tie.
- **`img-src https:` stays wide.** Scraped company logos come from anywhere;
  narrowing breaks the CRM's primary visual. Accepted, documented.
- **REST take:500 vs MCP take:200.** Different consumers, different budgets:
  agents page with queries, the UI paginates. Documented as intended.
