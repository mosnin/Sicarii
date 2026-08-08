# 0015 - Platform foundation: sync, evidence, queue, fields, deals, social, voice

- **Date:** 2026-08-07 / 2026-08-08
- **Movement:** Ritual -> Altar (Magic owed: nothing here has been observed live)
- **Trigger:** competitive read of `trycompai/crm` (MIT, agent-first CRM over
  first-party data) surfaced six capabilities Scalar lacked; founder directed
  all of them in, plus Composio-based sync, SocQ social research, and bringing
  voice in house on LiveKit with numbers sold in-product.

## The decision

Adopt the competitor's strongest ideas re-shaped for a multi-tenant cloud MCP
platform, and reject their deployment-shaped ones. What we took, what we
changed, what we refused:

| Theirs | Ours | Changed because |
|---|---|---|
| Mailbox/calendar sync (own OAuth, single tenant) | `ConnectedAccount`/`MailboxSync` etc. via **Composio** (`link()` flow, one webhook for all tenants, dedupe on `webhook-id`) | We are cloud multi-tenant; Composio holds the tokens, we hold handles |
| Evidence ledger (`ContactFact`, noisy-OR, bands) | `RecordFact`, polymorphic over contact/entity, same arithmetic (contradiction clamps to 0.45, VERIFIED needs a primary source), PROPOSED queue a human settles | Upgrades our flat per-provider confidence; ambiguity becomes a suggestion instead of a discard |
| `FOR UPDATE SKIP LOCKED` task queue | `AgentTask` + leased dispatcher; Inngest demoted to thin invoker | Our three crons could double-run and silently drop their tail on a timeout |
| Dynamic fields + `agentBrief` | Same, per tenant, `[userId, entity, key]` | A custom field is a question the operator wrote down; the agent fills it with no code change |
| Frozen-FX deal money | Same rules; `ExchangeRate` made **per tenant** after review caught a cross-tenant leak | One tenant's manual rate must never restate another's pipeline |
| Egress/data-boundary skill (prose only) | Prose PLUS enforcement: `egress.ts` wired into all six provider clients and the four shared record-write ops | We ship data to ~10 third parties; a rule nobody enforces is a wish |
| Bundled research agent | **Refused.** Everything lands as MCP tool packs the USER'S agent calls | The moat is any-agent-over-MCP; a bundled agent competes with it |
| Single tenant by design | **Refused.** Every new table userId-scoped | We are a cloud platform |

Plus two capabilities they do not have: **SocQ** social hydration/discovery
(hydrate-never-resolve rule; discovery cannot write records - see
`engineering/socq-integration.md`) and **in-house voice** on LiveKit
(control plane on Vercel, worker as a separate deployable on LiveKit Cloud
Agents, numbers sold in-product; US-only, inbound-only for now - see
`engineering/telephony.md`).

## Founder calls stamped this cycle

1. **Gmail scopes: Composio's full default set** (includes `mail.google.com`,
   a restricted scope). Consequences accepted: CASA assessment on the launch
   path; delete authority granted but never exercised (tool-slug allowlist).
2. **Numbers: LiveKit only, US only, for now.** Outbound therefore dormant
   behind `LIVEKIT_OUTBOUND_TRUNK_ID` with an honest error; carrier adapters
   kept as the future outbound path.
3. **Worker host: LiveKit Cloud Agents.**

## Gates

- **Desirable:** REASONED. Closes the reply-ingestion hole (today an agent
  chases people who already replied), turns discarded ambiguity into
  suggestions, gives deals real money. Observation owed.
- **Feasible: TESTED.** 733 tests green, tsc clean, all 7 tool packs wired,
  SDK facts verified against shipped source (Composio 0.15.0, LiveKit 1.6.2,
  SocQ 0.1.5) rather than training memory.
- **Deliverable:** REASONED. `prisma db push` (23 new tables, one plain column
  on users - no unique index on users, per the standing constraint), worker
  deploy, and env are all owed to reality.
- **Viable:** REASONED. Ingest priced near-free on purpose (first-party
  evidence must not be metered away); voice metered per minute off
  `room_finished` with per-call model usage attributed per tenant.

## Debts owed to reality (the Altar's work list)

- db push against real Supabase; Composio auth configs + one live webhook;
  one live Gmail thread ingested with a reply advancing CONTACTED->REPLIED.
- Voice: worker deployed, one real inbound call, one real outbound call
  (after an outbound trunk exists); PhoneNumberService Twirp shape settled
  with one live call.
- SocQ: storage/resale terms in writing BEFORE the key is set (procurement
  gate); real payload field names from one paid call per endpoint family.
- CASA assessment scheduled (Gmail restricted scope).
- Legacy AgentPhone path removal once LiveKit voice is observed working.
- `agents/voice` deps installed + its 63 tests wired into CI.
