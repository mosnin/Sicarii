# Scale-Readiness Audit, 2026-06-08

A full production-readiness sweep ahead of rolling out at scale: 7 parallel
auditors covering auth/isolation, the data layer, the MCP server, enrichment
providers, webhooks/jobs, rate-limiting/DoS/cost, frontend, config/deploy, and
cross-cutting reliability. ~50 findings; this doc records what was **fixed in
this pass** and what is **owed before scale** (items needing your infra access,
a deploy-strategy decision, or a guarded data migration).

## Verdict

**Not yet ready for an unbounded rollout, but close.** The code is unusually
disciplined on tenant isolation (no IDOR found across ~28 routes + the MCP/agent
ops layer). The blockers are a handful of **operational/infra** items, not
sprawling code rot. Clear the "Must fix before scale" list and you're there.

---

## Fixed in this pass (shipped)

| Sev | Fix | Files |
|---|---|---|
| **Critical** | **OAuth open-redirect → account-takeover closed.** `client_id` is now a signed token embedding the registered `redirect_uris`; `/authorize` requires an exact match *before* redirecting (or issuing a code) to it. A crafted link can no longer phish a victim's auth code into an MCP token. | `lib/oauth.ts`, `api/oauth/register`, `api/oauth/authorize` |
| **Critical** | **Provider fetch timeouts.** All 12 provider calls (Exa/Explorium/Pipe0/Bright Data/Tavily/Linkup/Firecrawl) route through `fetchWithTimeout` (30s). A hung upstream can no longer pin a serverless instance to the wall-clock limit and cascade 504s. | `lib/http.ts` + 7 provider clients |
| High | **MCP paid tools rate-limited.** `enrich_*`, `find_companies`, `search_web`, and the create tools are now per-user gated, so an external agent key can't loop them to burn provider credits. | `api/mcp/[transport]` |
| High | **`maxDuration=60`** added to heavy routes that were inheriting the short default and timing out mid-loop. | discover, both bulk-enrich, spawn-contacts, match-entity, analyze-site, both enrich |
| High | **Rate-limiter TTL race fixed.** `EXPIRE` is now set on every request, not just the first - a lost expire after `INCR` no longer locks a bucket at 429 forever. | `lib/rate-limit.ts` |
| High | **`user.deleted` no longer orphans data.** Segments + pipelines (scalar `userId`, no FK cascade) are explicitly deleted in a transaction - closes a GDPR/privacy gap. | `api/webhooks/clerk` |
| High | **Single-entity enrich rate-limited** (was the one enrich route with no cap). | `api/entities/[id]/enrich` |
| Med | **`enrich_entity` idempotency** - short-circuits if firmographics already present (stops re-charging Explorium on repeat calls). | `lib/crm-operations.ts` |
| Med | **Research-schedule ingestion now honors the creation budget** (was bypassing the flood guard). | `inngest/functions.ts` |
| Med | **Safe indexes added:** `(userId,updatedAt)` + `(userId,createdAt)` on Entity/Contact, `(exaMonitorId)` on IntentMonitor - hot list/webhook/flood-guard paths. | `schema.prisma` |
| Med | **robots.txt + sitemap.xml** fixed (were pointing at the old `foritudo.agency` domain). | `public/` |
| Low | Dashboard `error.tsx` restyled to brand tokens (was a black/charcoal off-brand screen); `X-XSS-Protection: 0` (modern guidance). | `(dashboard)/error.tsx`, `next.config.ts` |
| Low | pgvector ivfflat index uncommented + documented as a required Supabase step. | `supabase-setup.sql` |

---

## MUST fix before scale (owed - needs your infra/decision)

These are confirmed and high-impact, but cannot be safely auto-applied from code
(they need DB access, a deploy-strategy change, or a guarded data migration).

1. **Set up Upstash Redis (rate limiting is per-instance theater without it).**
   When `UPSTASH_REDIS_REST_URL/TOKEN` are unset, every limit falls back to an
   in-memory map - on serverless that means effective limit = N instances ×
   limit, i.e. near-unlimited under load. The code is ready; set the two env
   vars in Vercel. **Without this, none of the rate limits above actually hold.**

2. **Stop `prisma db push` at deploy; move to `prisma migrate deploy`.**
   `package.json` build runs `prisma db push` against the live DB on every
   Vercel build - no migration history, and a removed/renamed field silently
   drops a production column. Needs a baselined migration set (requires DB
   introspection). Highest operational blast radius.

3. **Add DB unique constraints for dedup, then convert creates to upsert.**
   The "one company per domain / no double entries" promise is enforced only in
   app code (check-then-create), so concurrent ingestion (cron + Exa webhook +
   agent, which are designed to run together) creates duplicates. Add
   `@@unique([userId, domain])` (Entity) + `@@unique([userId, email])` (Contact)
   - but this **requires deduping existing rows first**, or the index build
   fails. Do it as a guarded migration (dedupe → constrain → `upsert`), not a
   blind push.

4. **Create the pgvector index on Supabase** (`supabase-setup.sql` step 4). The
   agent recalls memory on every turn via a full sequential scan today; it
   degrades linearly. `db push` won't create it (raw SQL) - run it once.

5. **Move long/slow operations to background jobs.** `find-here`,
   `deep-report`, `bulk-enrich`, and `segment-build` can exceed 60s under load
   (sequential provider calls, 1 req/s geocoding, 200-vector embeds). Return
   fast, finish via Inngest.

6. **Replace Nominatim geocoding.** 1 req/s is a hard, *globally shared* ceiling
   (OSM will block heavy automated use); a keyed geocoder (Mapbox/Google) or a
   background queue is required for map features at scale.

---

## SHOULD fix soon (tracked)

- **OAuth token revocation + refresh rotation** - 30-day refresh tokens are
  non-revocable skeleton keys; bring to parity with the revocable API keys.
- **Bound the remaining MCP/REST input schemas** (`.max()` on strings/arrays;
  several MCP tools and the `intent-monitors`/`research-schedules`/`cleanup`
  routes trust unbounded input) and add a request body-size cap.
- **CRM list pagination** - lists are hard-capped (`take:200/500/2000`) but not
  paginated; a power user silently can't see records past the cap, and the
  client re-filters/sorts the whole 500 on every keystroke.
- **Accuracy holes:** `match-entity` can guess a company domain from a free-text
  name / unverified Exa hit; phone enrichment accepts an unverified person's
  number. Both can persist wrong-person/company data (the one unforgivable bug).
- **Webhook idempotency** - the Exa webhook re-extracts + re-creates `MonitorRun`
  on every retry (no delivery-id dedup); ack-fast + enqueue.
- **SSRF guard** is literal-host only (DNS-rebinding + decimal/IPv6 encodings
  bypass it) - resolve and re-check the IP before connecting.
- **Inngest cron fan-out** - one invocation processes all users' due monitors
  serially with no `take`/`step.run`; fan out per-monitor so one slow user
  can't starve the batch (and retries don't re-run completed work).
- **Encrypt `agentMailApiKey` at rest**; require a dedicated `MCP_OAUTH_SECRET`
  in prod (stop the `CLERK_SECRET_KEY` fallback); nonce-based CSP (drop
  `unsafe-eval`); memory/MonitorRun retention; provider retry/backoff + per-user
  spend caps.

---

*Method: 7 read-only auditor agents, each owning a subsystem, with a
production-at-scale lens. Full per-domain findings are in the session transcript;
this is the consolidated, actioned summary.*
