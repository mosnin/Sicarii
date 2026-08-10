# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile - the *aim*.)

**Binding constraint right now:** _The product is now feature-complete against
its own claims and hardened: 782 tests, tsc + lint clean. The autonomous outreach
loop exists end to end in code (send -> sequences -> stop-on-reply, all through
one compliance chokepoint), the reply loop is visible on the record pages, the
compliance sweep is done, and the money paths (voice billing, number rent,
revenue-weighted bandit) are correct under an adversarial review. What remains is
entirely REALITY: no db push, no live Composio webhook, no deployed voice worker,
no SocQ terms. The gap between "the code is right" and "a tenant watched it work"
is the whole product now._

**The cycle in flight: 0016 - Autonomy + polish + hardening** (see
`engineering/claims-audit-2026-08-09.md` for the full close-out)

Card 0015 (platform foundation) shipped; the follow-on loop closed every
confirmed gap from the 08-09 claims audit: the send path (compliance-complete),
suppression management, sequences (the cadence engine with stop-on-reply),
number renewal billing, deliverability warmup, revenue attribution, the
compliance sweep (honest deletion + full export + current subprocessors +
external revocation + voice retention), the operator-facing reply/meeting/
signature UI, the sequences + suppression UIs, and a hardening pass that fixed
two blockers and three majors found by adversarial review.

| # | Phase | Owner | Status |
|---|-------|-------|--------|
| 0 | `prisma db push` (23 new tables; the one `users` column is plain, no unique index) | founder + eng | BLOCKING |
| 1 | Composio: create the two auth configs, set the 4 env vars, subscribe the webhook, then observe ONE live thread ingest a reply and advance CONTACTED -> REPLIED | founder + eng | after 0 |
| 2 | Voice: `pnpm install` in `agents/voice`, `lk agent deploy`, set LIVEKIT_* + SCALAR_INTERNAL_SECRET, buy one number, observe ONE inbound call answered from real CRM data | founder + eng | after 0 |
| 3 | SocQ procurement gate: storage/resale terms in writing BEFORE the key is ever set in prod | **Founder** | independent |
| 4 | Decide managed vs custom Google OAuth app (custom = 1-min polling + our branding, but CASA moves to us; managed = slow polling, CASA is Composio's) | **Founder** | with 1 |
| 5 | Gate out: founder observes sync + suggestions queue + one call as one journey; RECORD | Founder | last |

**Riskiest assumption under test:** _reply-detection freshness. The 15-min
polling floor applies ONLY to Composio's managed OAuth app; a custom Google
OAuth client in the auth config polls at 1 minute (set
COMPOSIO_POLL_INTERVAL_MINUTES). The trade to decide at phase 1: managed auth
means Composio carries Google's CASA verification but the consent screen says
Composio and polling is slow; our own OAuth app means 1-min polling, our
branding, dedicated quota, and CASA lands on us. Ship managed to observe the
loop, move to a custom app for production feel._

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
