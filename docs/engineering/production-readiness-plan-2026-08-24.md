# Production-Readiness Plan - 2026-08-24

> Audit of Scalar as it actually is, plus the sequenced plan to make it
> production-ready and able to scale. Led by the producer, with vision, the
> human, the engineer, and the banker advising. Gate Card:
> `docs/decisions/0015-production-readiness.md`.
>
> Status: living plan. Update the phase tables as items land. Do not add
> features from this doc; execute the phases in order.

**Verdict: not ready to scale. Built, marketed, and still unfelt.**

The codebase on `main` is a real agent-operated CRM. The factory that would
make it the same product every time, for paying users, at volume, is not
standing. That is the gap. Close the factory before adding another surface.

---

## How to read this

1. **Where we are** is the audit. Facts, not wishes.
2. **The four gates** is the judgment.
3. **The plan** is five phases. Do them in order. A later phase that starts
   before an earlier one is finished is a failure of the plan, not a shortcut.
4. **Founder Calls** cannot be closed by an agent. They are listed last so
   they are not buried, and they are also inlined where they block a phase.

Evidence rungs used below: REASONED (argued), TESTED (ran in this repo or
against a live URL), OBSERVED (the world answered). Nothing here claims
OBSERVED for a first paying user. That evidence does not exist yet.

---

## 1. Where we are

### 1.1 What Scalar is

**The CRM your agents run.** A structured CRM (entities, contacts, pipelines,
memory) with a real UI and a 66-tool MCP server, so an external agent or the
built-in one discovers, enriches, and operates the same records a human sees.

North Star: *quiet leverage* - open it and the work is already happening.
Moat claimed: structure + UI + intelligence + agent-native, as one system.

Product of record is `origin/main` @ `b235cdb` (Voice-native CRM, #55).
The GitHub *default* branch is not that. See 1.6.

### 1.2 What is actually shipped (code)

A full product, wider than the original PRD.

| Surface | Status | Notes |
|---------|--------|-------|
| Marketing site | Live | `tryscalar.xyz` / `www.tryscalar.xyz`. Copy bugs on the hero and CTA. |
| Auth | Live | Clerk. `CLERK_WEBHOOK_SECRET` is **missing** in prod, so user/org sync is unverified. |
| CRM (entities, contacts, export) | Shipped | Per-user scoped. Dedup is app-level only. |
| Welcome / First Run | Shipped (code) | `/welcome` + SSE orchestrator. Live observation still owed. |
| Pulse | Shipped (code) | Hidden on first visit. Needs agent activity to appear. |
| Provenance | Shipped (code) | Pills + `get_provenance`. Re-verify cron has no scheduler and no `CRON_SECRET`. |
| Handshake / `/connect` | **Not built** | Settings shows a static MCP URL. Marketing `ConnectionDemo` is an animation. |
| Discover / Radar / Field / Map / Skills | Shipped | Dock promotes Radar, Field, Autopilot against the "demote them" rule. |
| Built-in agent | Shipped, env-gated | Needs `OPENAI_API_KEY` (set in prod). |
| MCP | **66 tools** | Real. Auth via `scl_` keys or OAuth. Not all writes are rate-gated. |
| Teams v1 | Shipped (code) | Clerk Orgs + synthetic workspace rows. Org-switch bugs open (#65, #66). Team plan not on `/pricing`. |
| Autopilot / Swarm / Breakup / Bandit / Voice | Shipped (code) | Unobserved. Breakup "approve" does not send email. |
| Billing meter | Real | Atomic decrement, GREATEST refill, ledger, idempotency. 460 unit tests include this. |
| Stripe / x402 | Implemented, **off** | Prod health: both `missing`. Checkout returns 501. |
| Email send | **Not built** | AgentMail client is read-only. Settings copy says "send and sync". |
| Deal object | Planned | Pipelines + status fields stand in. `product.md` is honest; marketing says "deals". |
| Admin | Dead | `isStaff` is computed and then voided. PRs #60/#62 are extra surface. |
| `/contact` form | Theater | Sleeps 1s, sets submitted. No API. |

### 1.3 What production actually looks like (OBSERVED 2026-08-24)

`GET https://www.tryscalar.xyz/api/health` and
`GET https://sicarii.vercel.app/api/health` returned the same report:
**13 pass / 10 missing / 1 partial**. `ok: false`.

`https://app.tryscalar.xyz` and `https://app.tryscalar.xyz/api/health`
returned **HTTP 500**. The app subdomain a first user is pointed at is down.

| Integration | Prod |
|-------------|------|
| Clerk auth | pass |
| Clerk webhook | **missing** |
| Supabase / Prisma | pass |
| Tavily, Exa, Linkup | pass |
| Explorium, Pipe0, Firecrawl | pass |
| OpenAI | pass |
| Inngest signing key | pass |
| Stripe (all price IDs) | **missing** |
| x402 / CDP | **missing** |
| Upstash Redis | **missing** (rate limits are per-instance theater) |
| `MCP_OAUTH_SECRET` | **partial** (falls back to `CLERK_SECRET_KEY`) |
| `CRON_SECRET` | **missing** |
| Apify, Bright Data, Companies House, email waterfall, Bouncer | missing (optional) |

The June heading that said "fund Explorium/Pipe0" and "Explorium 403ing"
is stale. Discovery and enrichment keys are set. Money, durable rate limits,
and user/org webhooks are not.

Homepage copy defects (live, `tryscalar.xyz`):

- Hero: "CompanyLeadintelligence at agent speed" (words concatenated)
- About close: "Ready to run your agentCRM?agent CRM?"
- Differentiator: "Scalar ownsstructure."

### 1.4 What the tests cover

- **460** vitest tests in 38 files. Strong on credits, idempotency, isolation,
  OAuth rotation, autopilot budget, env-doctor, SSRF.
- **No e2e.** No Playwright specs. No CI workflow (`.github/workflows` does
  not exist). PR checks are Vercel preview comments only.
- MCP is covered by source-parse gating tests, not a live protocol handshake.

### 1.5 Open work that already exists

14 open PRs. Zero GitHub issues. Highest-leverage ones:

| # | Title | Base | Why it matters |
|---|-------|------|----------------|
| **63** | Stop research schedules from wiping contact notes and deal status | `main` | P0 data loss. Mergeable. |
| **64** | Fix critical send-path honesty bugs | `main` | P0: failed calls logged as sent; inbound email does not advance pipeline. Draft. |
| **68** | Stop research schedules from re-billing after a failed run | ritual branch | P1 money. Coordinate with #63. Wrong base. |
| **65** / **66** | Org-switch UI / contact bleed | `main` | Teams is unsafe to demo until these land. |
| **70** | Stop team members from revoking workspace API keys | ritual branch | P1 security. Wrong base. |
| **52** | DB unique constraints for dedup | `main`, CONFLICTING | Scale P0. Needs founder dedupe SQL first. |
| **48** | Encrypt AgentMail/AgentPhone keys | `main`, CONFLICTING | Security P1. Needs `SECRETS_ENCRYPTION_KEY`. |
| **69** | Regression tests (share, radar, pulse, segments) | ritual branch | Good coverage, wrong base. |
| **67** | Older test PR | ritual branch | Close. Superseded by #69. |
| **60** / **61** / **62** | Admin desk, x402 pay-per-call, owner bypass | `main` | **Defer.** More surface, not scale. |
| **3** | Supabase setup SQL | `main`, CONFLICTING | Close. Superseded by `prisma/supabase-setup.sql`. |

### 1.6 The factory is pointed at the wrong product

GitHub default branch is `claude/dazzling-gates-83GU4`. That branch contains
the Ritual framework and almost none of Scalar (`CLAUDE.md`, `.ritual/`,
`.claude/`). `main` has ~80 product commits and ~94k lines this branch
deleted.

Consequences already visible:

- New clones and some cloud agents start on an empty repo.
- PRs #67, #68, #69, #70 targeted the Ritual branch because it is default.
- `homepageUrl` on the GitHub repo is still `https://sicarii.vercel.app`.

This is the single highest-leverage process fix. It is a Founder Call
(GitHub settings). It is Phase 0, item 1.

### 1.7 Honesty check against our own claims

| Claim | Reality |
|-------|---------|
| "Connect your agent. It just works." | OAuth handshake never observed. Handshake page not built. |
| "Deduped on the way in" | App-level check-then-create. Concurrent ingest duplicates. #52 open. |
| "Deeply enriched in seconds" | Providers are funded. Loop still unobserved by the founder. |
| "Agents run email relationships" | Read/sync only. No send. Breakup approve does not send. |
| "Full MCP + agent" on free | True in code. 66 tools, not the "12 typed tools" on the marketing demo. |
| Team plan $299 / 30k credits | In `PLANS.team`. Missing from `/pricing`. Stripe team price unset. |
| Business vs Pro | Business is $99 / 8k; Pro is $129 / 12k. Business is worse $/credit. |
| "Rate limited" | Code ready. Prod has no Upstash, so limits do not hold across instances. |
| "Billable" | Meter is real. Checkout is 501. No one can pay. |

---

## 2. The four gates

| Gate | Verdict | Rung | Why |
|------|---------|------|-----|
| **Desirable** | PASS | REASONED | The idea still deserves to exist. Agents need a structured body. The North Star is clear. |
| ↳ 5-second gate | FAIL | TESTED (against the live site) | Marketing hero is broken copy. `app.tryscalar.xyz` is 500. First-run has never been observed. Quiet leverage is not yet a feeling a stranger can have. |
| **Feasible** | PASS (core) / FAIL (scale) | TESTED | 460 unit tests pass; ops layer is real; providers respond at the env-var level. Open P0 data-loss and honesty bugs (#63, #64) mean "it works" is not true on every path. |
| **Deliverable** | FAIL | OBSERVED (the factory) | Default branch is not the product. No CI. `prisma db push` on every deploy. 14 open agent PRs, most draft, several on the wrong base. Cannot make the same product twice. |
| **Viable** | FAIL | REASONED | No Stripe. No x402. No observed revenue. Pricing page inverts Business/Pro. Seat limits are decorative. Provider spend has no durable rate-limit backstop. |

**Synthesis:** Vision still wants this product. The producer vetoes scale.
The banker vetoes a launch that cannot take money and cannot cap spend.
The human vetoes a first five seconds that 500s or shows sample rows
without saying the loop was felt.

**Tie-break:** we do not add features. We stand up the factory, stop the
bleeding, turn money on, then observe the four moments. Taste does not
overrule a failed deliverable gate.

---

## 3. The plan

Five phases. Each phase has an exit test. Do not start the next phase
until the exit test is true.

```
0  Restore the factory     default branch, CI, app host, health
1  Stop the bleeding       P0/P1 bugs already written
2  Turn production on      founder env + migrate + uniqueness
3  Make the promise true   one observed journey, honest copy, Handshake
4  Scale the factory       jobs, pagination, monitoring, seats
```

Phase 4 is the only phase that is "scale." Phases 0-3 are "production
ready for a first cohort." Shipping Phase 4 work during Phase 0 is how
we got 66 tools and a 500 on the app host.

### Phase 0 - Restore the factory

**Owner:** Founder (settings) + one agent (CI, health diagnosis).
**Exit test:** a new clone of the default branch is Scalar; `pnpm test`
runs on every PR to `main`; `app.tryscalar.xyz` returns 200; `/api/health`
on the app host matches www.

| # | Work | Owner | Done when |
|---|------|-------|-----------|
| 0.1 | **Switch GitHub default branch to `main`.** Settings → Branches. Leave `claude/dazzling-gates-83GU4` as history. | Founder | `gh repo view` shows `defaultBranchRef.name = main` |
| 0.2 | Set GitHub `homepageUrl` to `https://tryscalar.xyz`. | Founder | Repo header matches the live brand |
| 0.3 | Retarget open PRs that used the Ritual branch (#68, #69, #70) onto `main`. Close #67 and #3. | Agent | Those PRs list `base: main` or are closed |
| 0.4 | Add `.github/workflows/ci.yml`: `pnpm lint`, `pnpm test`, `npx tsc --noEmit` on PRs to `main`. Do not run `prisma db push` in CI. | Agent | A PR shows a green CI check that is not "Vercel Preview Comments" |
| 0.5 | Diagnose `app.tryscalar.xyz` 500. Likely a separate Vercel project, a missing env, or Clerk domain mismatch. Fix or 301 it to `www` until it serves the same app. | Founder + agent | `curl -sI https://app.tryscalar.xyz` is 200 or a deliberate redirect |
| 0.6 | Confirm Vercel production deploys from `main`, not the Ritual branch. | Founder | Latest production deployment SHA is on `main` |

**Do not** install more providers, open more feature PRs, or rebuild the
Ritual branch into a second product.

### Phase 1 - Stop the bleeding

**Owner:** Agent (rebase + merge) after founder review.
**Exit test:** #63, #64, #68, #65, #66, #70 are on `main`. A research
schedule cannot wipe notes. A failed call cannot be logged as sent.
Switching orgs cannot show the previous org's contacts. A member cannot
revoke every workspace key.

| # | PR | Class | Notes |
|---|----|-------|-------|
| 1.1 | **#63** notes/status wipe | P0 data | Merge first. Non-draft, targets `main`. |
| 1.2 | **#64** send-path honesty | P0 trust | Undraft. Failed send ≠ sent. Inbound email must move the pipeline. |
| 1.3 | **#68** failed-run rebill | P1 money | Rebase onto `main` after #63. Do not charge a miss. |
| 1.4 | **#65 + #66** org switch | P1 teams | Merge as a pair. |
| 1.5 | **#70** key revoke authz | P1 security | Retarget to `main`. Admins only. |
| 1.6 | **#69** regression tests | P1 | Retarget to `main`. Close #67. |

**Defer (do not merge in this phase):** #60 admin desk, #61 x402 pay-per-call,
#62 owner credit bypass. They add surface and a founder-only money hole.

### Phase 2 - Turn production on

This is the unpaid scale-audit list, refreshed against the 2026-08-24
health report. Most rows are Founder Calls.

**Exit test:** `/api/health` summary is `ok: true` for the *required*
groups (Auth including webhook, Database, Stripe, Upstash, MCP OAuth
secret). A Stripe checkout on starter completes and credits appear.
Rate-limit keys exist in Upstash. `prisma migrate deploy` is what
production runs, not `db push`.

#### 2A. Founder env (cannot be done from code)

| # | Action | Why |
|---|--------|-----|
| 2.1 | Create an Upstash Redis database. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on the production Vercel project. | Without this, every rate limit is per-instance and bypassable. This is the highest-leverage security env var. |
| 2.2 | Stripe: create monthly Prices for starter / pro / business / team. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_TEAM`. Register `https://www.tryscalar.xyz/api/webhooks/stripe` for `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`. | Nobody can pay today. |
| 2.3 | Clerk: subscribe the webhook to `user.*`, `organization.*`, `organizationMembership.*`. Set `CLERK_WEBHOOK_SECRET`. Enable Organizations if Teams will be offered. | Users and orgs will drift from the DB without this. |
| 2.4 | Generate `MCP_OAUTH_SECRET` (`openssl rand -hex 32`) and set it. Stop signing MCP tokens with `CLERK_SECRET_KEY`. | One secret, two security contexts is a standing audit finding. |
| 2.5 | Set `CRON_SECRET`. Wire a Vercel cron (or Inngest) to `POST /api/provenance/re-verify` with that bearer token. | The route exists and is unprotected / unschedulable today. |
| 2.6 | Confirm `INNGEST_SIGNING_KEY` is the production Inngest key (health says pass; confirm the app is the connected Inngest app). | Forged `/api/inngest` invocations are otherwise free compute. |
| 2.7 | **Founder Call - pricing shape.** Decide: is Business the mid tier (then rename or drop it) or the top tier (then give it more credits than Pro)? Team is $299 / 30k / 5 seats in code and invisible on `/pricing`. Pick one ladder and we will make the page and `PLANS` match. | Viable gate is blocked on this, not on more plans. |

x402 treasury (wallet + CDP keys) is **optional for cohort 1**. Stripe
first. Do not block Phase 3 on USDC.

Optional providers (Apify, Bright Data, Companies House, email
waterfall, Bouncer) stay optional. Do not buy them to "complete" health.
Health `ok` should be redefined so optional rows do not fail the
production bar (agent work, 2.8).

#### 2B. Agent / schema work

| # | Work | Done when |
|---|------|-----------|
| 2.8 | Split env-doctor into **required for production** vs **optional capability**. `/api/health` `ok` should be true when required rows pass, even if Apify is missing. | `ok` means "safe to take traffic," not "every experiment is funded" |
| 2.9 | Stop `prisma db push` in `package.json` `build`. Introduce `prisma/migrations`, baseline from the live DB, run `prisma migrate deploy` on production. | A removed field cannot silently drop a prod column on the next deploy |
| 2.10 | Rebase **#52**. Founder runs `prisma/maintenance/find-duplicate-*.sql`, merges or deletes dupes, then we add `@@unique([userId, domain])` and `@@unique([userId, email])` and convert creates to upsert. | Concurrent cron + webhook + agent cannot insert two Acmes |
| 2.11 | Rebase **#48**. Set `SECRETS_ENCRYPTION_KEY`. Encrypt `agentMailApiKey` / `agentPhoneApiKey` at rest. | A DB dump does not leak user provider keys |
| 2.12 | Run `prisma/supabase-setup.sql` section 4 (pgvector HNSW) once in the Supabase SQL editor. | Agent memory recall is not a sequential scan |
| 2.13 | Add the missing `team` mapping in `planForPriceId()` (`src/lib/stripe.ts`). | A team subscription webhook cannot apply the wrong plan |

### Phase 3 - Make the promise true

This is the 0006 cycle, finally gated by a working factory and live
keys. **No new tools. No new providers. No new nav items.**

**Exit test:** the founder (or one invited operator) completes the
journey below on production, records a yes/no on quiet leverage, and
the public site no longer lies.

#### 3A. One observed journey (Founder)

Run this on `www` or the repaired `app` host, signed up as a new user:

1. Sign up → `/welcome` → one sentence ICP.
2. Watch companies appear and three enrich. Time it. Note stutters.
3. Open dashboard. Confirm it is not a sample banner unless a key
   actually failed.
4. Leave, come back. Does Pulse say something true?
5. Mint an API key. Call `list_entities` then `create_contact` from
   Claude / Cursor / a script (`pnpm smoke:mcp`).
6. Open one contact. Confirm a provenance pill on an enriched field.
7. (If Clerk Orgs on) create an org, invite a second account, switch,
   share one lead, write via a workspace key.
8. Run a Stripe starter checkout in test mode, then once in live.
9. Write the verdict into `docs/decisions/heading.md`: felt / flat /
   broken, with the timestamps.

**Falsifier (unchanged from 0006):** if the loop works but feels flat,
stop. Fix the loop. Do not choreograph chrome onto a flat loop.

#### 3B. Product honesty (Agent, after 3A or in parallel where safe)

| # | Work | Why |
|---|------|-----|
| 3.1 | Build Moment 4: a `/connect` (or Settings-hosted) view that polls `ApiKey.lastUsedAt` and flips green on the first real agent write. Kill the scroll-triggered `ConnectionDemo` fiction or label it "illustration." | The five-second promise is "connect your agent, it just works." |
| 3.2 | Fix live homepage copy: hero, "owns structure," "agent CRM" CTA. | First five seconds on the public URL are currently broken. |
| 3.3 | Settings: AgentMail is "sync," not "send and sync," until send exists. | Trust. |
| 3.4 | `/pricing`: put the decided ladder on the page. Include Team if we are selling it. Turn `SALE` off unless a real sale is running. | Viable + honesty. |
| 3.5 | Marketing MCP demo: stop saying "12 typed tools." Point at the skill doc. | Drift. |
| 3.6 | `product.md`: mark Deal as "pipelines, not a Deal object." Keep it Planned until we mean it. | Docs honesty. |
| 3.7 | `/contact`: either wire an email or remove the fake submit. | Theater. |
| 3.8 | Dock vs empty-state: keep Radar / Field / Autopilot out of the first-session dock if the account is empty. Moments, not a feature wall. | 0006 hard rule, still correct. |

Email *send* is a Founder Call (3.9). If the first cohort needs outbound,
build a thin AgentMail send with human confirm, and make breakup approve
call it. If they do not, stop claiming "email relationships" in
marketing. Do not build a sequencer.

### Phase 4 - Scale the factory

Only after Phase 3's journey is recorded as *felt* or *flat-and-we-know-why*.

**Exit test:** 100 concurrent users cannot (a) duplicate a domain,
(b) bypass rate limits, (c) pin a serverless instance for 60s on
`find-here` / bulk-enrich / swarm, (d) disappear past a silent
`take: 500` cap, (e) fail without someone seeing it.

| # | Work | Class |
|---|------|-------|
| 4.1 | Move `find-here`, `deep-report`, `bulk-enrich`, `segment-build`, swarm fan-out onto Inngest. Return a job id. | Reliability |
| 4.2 | Fan out Inngest crons per monitor / per plan (`step.run`), with a `take` cap. One slow user cannot starve the hour. | Reliability |
| 4.3 | Replace Nominatim (1 req/s, global) with a keyed geocoder, or keep Map as a preview and stop backfilling live. | Scale ceiling |
| 4.4 | Cursor pagination on CRM lists (UI + MCP). The silent 200/500 cap is a data-loss UX. | Correctness |
| 4.5 | Error monitoring (Sentry or equivalent) on production. Today failures are Vercel log paste. | Ops |
| 4.6 | Enforce `PLANS.*.seats` on org invites. Soft cap is not a cap. | Viable |
| 4.7 | Nonce CSP (drop `unsafe-eval` / `unsafe-inline`) after Clerk compatibility check. | Security |
| 4.8 | OAuth refresh already rotates (`RevokedToken`). Add a settings "revoke all agent sessions" that fills it. | Security |
| 4.9 | Per-user provider spend caps on top of credits (a stuck loop should die at $N, not at zero credits after the fact). | Viable |
| 4.10 | Memory / MonitorRun retention. Unbounded history is a cost and a privacy hole. | Ops |

---

## 4. What we will not do

These look like progress and are how the last two months got wide and
unfelt. They are closed until Phase 3 exits.

- New MCP tools, new providers, new dock items.
- Admin desk (#60), owner credit bypass (#62), x402 pay-per-call (#61).
- A native workspace system that competes with Clerk Orgs.
- A Deal object, a sequencer, a support desk, a marketing suite.
- Rebuilding Scalar on the Ritual-only branch.
- "World-class" perf work that changes Moment 1 from sequential to
  parallel (already decided: the live fill *is* the choreography).

If a new idea is truly a blocker for the observed journey, it is a
Founder Call, not an agent default.

---

## 5. Suggested sequence of execution

A concrete order an agent + founder can run without re-planning:

1. Founder: 0.1, 0.2, 0.6 (10 minutes of GitHub + Vercel settings).
2. Agent: 0.3, 0.4 (CI + retarget PRs).
3. Founder + agent: 0.5 (app host 500).
4. Founder reviews and merges 1.1 → 1.6 in that order.
5. Founder: 2.1-2.6 (env). Founder Call 2.7 (pricing).
6. Agent: 2.8, 2.13 immediately; 2.9-2.12 once founder has run dedupe
   SQL and set encryption + HNSW.
7. Founder: Phase 3A journey, written into the heading.
8. Agent: 3.1-3.8 (honesty + Handshake).
9. Only then Phase 4, one item at a time, each with a Gate Card if it
   changes product shape.

---

## 6. Founder Calls (cannot be invented)

Handed over, not answered here.

1. **Switch the GitHub default branch to `main`.** Required for every
   later agent to work on the product.
2. **Repair or retire `app.tryscalar.xyz`.** First-user host is 500.
3. **Pricing ladder.** Business vs Pro vs Team. One page, one `PLANS`
   table, live Stripe prices.
4. **Is Stripe-only enough for cohort 1, or must x402 settle too?**
   Recommendation: Stripe only. x402 is a second money rail.
5. **Do we sell Teams in cohort 1?** If yes: enable Clerk Orgs, merge
   #65/#66/#70, put Team on `/pricing`. If no: hide the
   OrganizationSwitcher for free/starter/pro.
6. **Phase 0 Reality Gate, version 2.** Providers are funded. The
   remaining question is taste: does discover → enrich → news, live,
   feel like quiet leverage? Watch it. Record felt / flat / broken.
7. **Email send: now, later, or never for v1?** Marketing already
   claims it. Code does not do it.
8. **First cohort size.** Recommendation: closed beta, invite-only,
   credit-capped, until Phase 3A is OBSERVED. Unbounded signup while
   Upstash and Stripe are missing is how we get a bill and a breach
   report on the same day.

---

## 7. Scoreboard (re-check after each phase)

| Bar | Now | After Phase 3 | After Phase 4 |
|-----|-----|---------------|---------------|
| Default branch is the product | No | Yes | Yes |
| CI gates `main` | No | Yes | Yes |
| App host serves the app | No (500) | Yes | Yes |
| Health `ok` for required rows | No | Yes | Yes |
| Someone can pay | No | Yes | Yes |
| Rate limits hold across instances | No | Yes | Yes |
| Dedup holds under concurrency | No | Yes | Yes |
| P0 data-loss / honesty bugs | Open | Closed | Closed |
| First-run observed | No | Yes (felt or flat) | Yes |
| Handshake exists | No | Yes | Yes |
| Public copy matches the product | No | Yes | Yes |
| Long jobs are async | Partial | Partial | Yes |
| Errors page a human | No | Optional | Yes |
| Ready for unbounded signup | **No** | **No** (cohort only) | **Yes, if 3A was felt** |

---

## 8. Relation to older plans

This plan supersedes the *aim* of
`docs/engineering/scale-audit-2026-06-08.md` and
`docs/engineering/world-class-plan-2026-07-02.md` without erasing them.
Those docs were correct. Most of their "owed" list is still owed.
What changed:

- Feature surface exploded (0007-0014) while the owed list sat.
- Providers on production are now funded (the old Phase 0 is half-paid).
- Stripe still is not.
- A Ritual-only branch became the GitHub default and is now a
  production incident of its own.
- `app.tryscalar.xyz` is 500. That did not exist as a finding in June.

When this plan and an older audit disagree on priority, this document
wins until the next RECORD.

---

*Audit date: 2026-08-24. Sources: `origin/main` @ `b235cdb`, live
`/api/health` on www + sicarii.vercel.app, `app.tryscalar.xyz` 500,
GitHub default branch + 14 open PRs, prior audits in
`docs/engineering/`. No first-user session was observed. That debt
stays named.*
