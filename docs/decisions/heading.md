# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile - the *aim*.)

**Binding constraint right now:** _The product on `main` is a real agent CRM
(66 MCP tools, funded providers, 460 tests) and is **not production-ready
to scale**. GitHub default branch is the Ritual skeleton. `app.tryscalar.xyz`
is 500. Stripe and Upstash are missing. First-run has never been observed.
Vision: idea 9, felt experience 4._

**The cycle in flight: 0015 - Production readiness**
(`0015-production-readiness.md` + `docs/engineering/production-readiness-plan-2026-08-24.md`)

| # | Phase | Owner | Status |
|---|-------|-------|--------|
| 0 | **Factory**: default branch → `main`; CI on PRs; fix or retire `app.tryscalar.xyz`; Vercel deploys `main` | Founder + agent | NEXT |
| 1 | **Bleed**: merge #63 #64 #68 #65 #66 #70 #69 onto `main` | Founder review + agent | NEXT |
| 2 | **Production on**: Upstash, Stripe, Clerk webhook, `MCP_OAUTH_SECRET`, migrate deploy, unique constraints (#52), encrypt keys (#48) | Founder env + agent | BLOCKED on 0-1 |
| 3 | **Promise**: one observed welcome → enrich → Pulse → MCP write → Stripe test; Handshake; honest copy | Founder watches, agent builds Handshake | BLOCKED on 2 |
| 4 | **Scale**: async jobs, pagination, monitoring, seats, Nominatim | agent | BLOCKED on 3 felt/flat |

**Hard rule this cycle:** no new surfaces, providers, or tools. Do not
merge #60 #61 #62. Do not rebuild on the Ritual branch.

**Riskiest assumption under test:** _that discover → enrich → news, now
that Explorium/Pipe0/Exa keys are set in prod, feels like quiet leverage.
If it is flat, fix the loop before Handshake chrome._

**Standing founder actions (cannot be done from code):**

1. Switch GitHub default branch to `main`.
2. Repair or 301 `app.tryscalar.xyz` (currently 500).
3. Set Upstash Redis. Rate limits are theater without it.
4. Stripe live: prices + webhook + `STRIPE_PRICE_*` including TEAM.
5. Clerk: `CLERK_WEBHOOK_SECRET` + Organizations if Teams is in cohort 1.
6. `MCP_OAUTH_SECRET` (stop falling back to Clerk).
7. Pricing ladder Founder Call: Business vs Pro vs Team.
8. Watch one live first-run. Write felt / flat / broken here.

**0006 Four Moments (still owed, not abandoned):** 1-3 shipped in code,
4 (Handshake) not built, gate-out never run. Phase 3 of 0015 *is* that
gate-out, after the factory works.

**DONE recent (do not redo):** providers funded on prod (Exa, Tavily,
Explorium, Pipe0, Firecrawl, Linkup, OpenAI) · env-doctor + `/api/health`
· Teams/social/autopilot/swarm/breakup/bandit/voice shipped as code ·
meter + x402 scaffolding · 460 unit tests · audits through 2026-07-11.
