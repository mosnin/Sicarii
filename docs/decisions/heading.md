# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile - the *aim*.)

**Binding constraint right now:** _Card 0015 (platform foundation) is built and
TESTED (733 tests, tsc clean) but nothing in it has touched reality: no db
push, no live webhook, no deployed voice worker. The gap between "the code
exists" and "a tenant's reply moved a contact to REPLIED on its own" is the
whole product right now._

**The cycle in flight: 0015 - Platform foundation** (`0015-platform-foundation.md`)

| # | Phase | Owner | Status |
|---|-------|-------|--------|
| 0 | `prisma db push` (23 new tables; the one `users` column is plain, no unique index) | founder + eng | BLOCKING |
| 1 | Composio: create the two auth configs, set the 4 env vars, subscribe the webhook, then observe ONE live thread ingest a reply and advance CONTACTED -> REPLIED | founder + eng | after 0 |
| 2 | Voice: `pnpm install` in `agents/voice`, `lk agent deploy`, set LIVEKIT_* + SCALAR_INTERNAL_SECRET, buy one number, observe ONE inbound call answered from real CRM data | founder + eng | after 0 |
| 3 | SocQ procurement gate: storage/resale terms in writing BEFORE the key is ever set in prod | **Founder** | independent |
| 4 | CASA assessment scheduled (Gmail restricted scope, chosen deliberately) | **Founder** | independent |
| 5 | Gate out: founder observes sync + suggestions queue + one call as one journey; RECORD | Founder | last |

**Riskiest assumption under test:** _that Composio's polling triggers (15-min
floor on managed auth) are fresh enough for reply detection to feel alive. If a
reply takes 15 minutes to land, the loop is correct but may feel dead; the fix
would be our own Google OAuth app (1-min polling), which drags CASA forward._

**Standing founder debts (unchanged from 0006-0014):** Stripe prices + webhook
in prod, Upstash env, pgvector HNSW index run once, Explorium top-up, Clerk
Organizations enabled for Teams, one x402 mainnet settlement.

**Hard rule this cycle:** nothing new lands until phases 0-2 are observed.
The foundation is wide enough; reality is the only missing dependency.

**DONE recent cycles:** 0006-0014 (four moments, x402, social channels, teams,
autopilot, swarm, breakups, bandit, voice-native inbound) · 0015 built: mailbox
+ calendar sync, evidence ledger, leased task queue, dynamic fields, deal
money, egress enforcement, SocQ social (dormant), LiveKit voice (dormant),
68 -> ~100 MCP tools across 7 packs.
