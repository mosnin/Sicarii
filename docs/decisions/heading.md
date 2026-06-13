# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile - the *aim*.)

**Binding constraint right now:** _The product is correct, honest, billable, and
hardened (audits 2026-06-06 -> 09; PRs #19-#29) - and still **unfelt**. Nothing
has been observed running end to end, and the product has zero choreographed
moments. Current Vision score: 6/10 (idea 9, felt experience 4)._

**The cycle in flight: 0006 - The Four Moments** (`0006-the-four-moments.md`)

| # | Phase | Owner | Status |
|---|-------|-------|--------|
| 0 | **Reality Gate**: fund Explorium/Pipe0, set Upstash, run pgvector index, then run discover -> enrich -> news LIVE and record whether it feels like quiet leverage | **Founder** | BLOCKING |
| 1 | **Moment 1 - The First Run**: one sentence -> the CRM builds itself, live, in 60s | agents (Wave A) | SHIPPED (code): `/welcome` + streaming orchestrator, honest sample-degradation until Phase 0. Live observation owed. |
| 2 | **Moment 2 - The Pulse**: "While you were away, your agent added 14 companies..." | agents (Wave A) | SHIPPED (code): `User.lastSeenAt` + `computePulse` (agent-added entities, distinct enriched refs from CreditLedger, MonitorRun signals) rendered in the dashboard hero band; never an empty brag. Needs `prisma db push` + live observation. |
| 3 | **Moment 3 - Visible Trust**: provenance on every enriched field + the honest blank | agents (Wave B) | SHIPPED (code): `FieldProvenance` + `via Explorium, 3d ago` + re-verify endpoint. |
| 4 | **Moment 4 - The Handshake**: /connect page that listens and flips green on the first agent write (+ first live OAuth observation) | agents (Wave B) | after Wave A |
| 5 | **Gate out**: founder runs all four moments as one journey; subtraction holds; RECORD | Founder | last |

**Parallel cycle shipped: 0007 - x402 agent payments** (`0007-x402-agent-payments.md`).
The CRM your agents run now lets the agents pay for it: USDC top-ups
(`/api/x402/topup`) and 30-day plan purchase (`/api/x402/subscribe`) over HTTP
402, env-gated to 501 until the treasury wallet + CDP keys are set. One live
mainnet settlement is owed to reality (the x402 sibling of Phase 0).

**Riskiest assumption under test:** _that the enrichment loop, observed live,
feels like quiet leverage. If it works but feels flat, we fix the loop before
choreographing it - chrome on a flat loop is the unforgivable spend._

**Standing debts (founder-side):** Stripe goes live (2026-06-12 migration off
Creem): create monthly Prices, set STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET /
STRIPE_PRICE_*, register /api/webhooks/stripe (checkout.session.completed,
invoice.paid, customer.subscription.deleted), run `pnpm prisma db push` ·
`/terms` needs a real SaaS ToS · prisma migrate deploy · DB unique
constraints (dedupe first) · Explorium top-up (currently 403ing in prod).

**Hard rule this cycle:** no new surfaces, providers, or tools. Moments, not
features. Radar/Field/Map/Skills stay demoted.

**DONE recent cycles:** rebrand + product marketing site (intelligence-first) ·
manifesto · 26-tool MCP server + OAuth (DCR/PKCE, redirect-validated) · billing
meter + Creem scaffolding + pricing w/ launch sale · CSV export + pagination ·
honest FAQ/About, agency pages deleted · 33 tests · five audits recorded ·
enrichment accuracy holes closed · Pipe0/logo/news fixed · creation guard +
rate limiting (durable w/ Upstash) · claims integrity restored (PRs #19-#29).
