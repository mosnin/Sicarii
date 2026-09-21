# Agent Outreach Mailboxes — Architecture

> How Scalar grows native cold/warm email: users buy domains (GoDaddy) and
> mailboxes (PremiumInboxes DFY) inside the platform; agents warm them, run
> sequences, and send — with the same safety invariants as every other Scalar
> surface. Core CRM behavior is untouched; outreach is additive tables +
> additive routes + additive MCP tools.

## Why this shape (from research, 2026-09)

| Source | What we took |
|---|---|
| **Origami.chat Sequencer** | The target UX: sequencing lives where research lives; multi-account rotation with per-account daily caps; warmup built in, not a separate tool; one shared inbox for replies; done-for-you inboxes ($4/mo) instead of per-seat fees. Scalar mirrors this: sequences enroll CRM contacts directly, sends rotate across ready mailboxes, replies land in the unified conversation thread. |
| **PremiumInboxes.com** | They sell *inboxes*, not domains ("bring your own domains"), $2.80–3.50/mo per inbox, human-verified SPF/DKIM/DMARC, unlimited replacements, <6h delivery, direct upload into sequencers. Scalar therefore splits the purchase path: **domains via GoDaddy API, inboxes via PremiumInboxes intake**. Their site exposes an API page but no public spec, so `premium-inboxes.ts` is a fulfillment adapter: structured order payload + CSV intake + status polling behind `PREMIUMINBOXES_API_KEY`, degrading to a manual-fulfillment queue (exact intake email/CSV the ops team needs) when the key is absent. |
| **GoDaddy Domains v3 API** | Fully programmatic domain purchase: `GET check-availability` → `POST registration-quotes` (locks price, 10-min `quoteToken`) → `POST registrations` (required `Idempotency-Key` + ICANN consent) → poll operation to terminal state. Bearer PAT auth. Wholesale `.com` $10.69/yr. `godaddy.ts` implements exactly this flow plus DNS record management for SPF/DKIM/DMARC. |
| **Bird.com Email API** | The send rail: `POST /v1/email/messages` with `category` (transactional vs marketing controls suppression policy) and `ip_pool_id` (shared default; dedicated pools auto-warmed ~30 days with overflow to shared). Built-in signing, suppression, blocklist monitoring, async delivery webhooks, sandbox test address. `bird.ts` implements send + domain verification + webhook handling. Cold outreach sends as `marketing` so Bird's suppression (bounces/complaints/unsubscribes) protects reputation automatically. |
| **warmbly/warmbly (OSS)** | The warmup engine shape: gradual 14–30 day ramp, seed engagement (opens/replies), reputation-aware caps. Scalar's `warmup.ts` encodes the ramp table; seed engagement runs through Bird to real seed addresses, never fake opens against prospects. |
| **coldoutboundskills (OSS)** | Agent skill shape: grade-a-campaign checklists, list-quality gates. Became `scalar-outreach` + `scalar-cold-writing` skills plus the pre-send checklist in the ops layer. |
| **mcp_agent_mail (OSS)** | MCP as the coordination layer for agents (identities, inboxes, threads over MCP). Scalar already is MCP-first; we add mailbox tools in the same route with the same `gated()` + credit patterns. |
| **PaulleDemon/Email-automation, dearagent, agenticmail** | Sequencer primitives (steps, delays, stop-on-reply) and "infrastructure for AI agents" framing. Folded into `OutreachSequence.steps` JSON + enrollment state machine. |
| **BraaMohammed/bricks (Clay alt), microwave-ai (enrichment)** | Evaluated for list-building/enrichment reuse. Verdict: **not integrated** — Scalar's waterfall (Explorium/Pipe0/findymail + strict name+company verification) is the accuracy moat; bricks-style scraping would bypass the "null over wrong" rule. Revisit only behind the same verification gate. |
| **SignalForce (radar upgrade)** | Evaluated for the ICP radar. Verdict: **not merged** — radar-run + intent monitors already cover signal detection; SignalForce patterns (if any) should arrive as a radar-seed source, not a replacement. Kept as owed investigation, not a dependency. |
| **kalyvask/winning-writing** | Cold-copy patterns (short, one CTA, concrete proof, PS line). Distilled into the `scalar-cold-writing` skill, not copied verbatim. |

## The flow (user-visible)

1. **Buy a domain** in Scalar (Outreach → Domains → search → quote → pay via
   Stripe checkout with `metadata: { kind: "domain_order" }`). Stripe webhook
   completes the GoDaddy registration, then auto-publishes SPF/DKIM/DMARC via
   the GoDaddy DNS API and starts verification polling.
2. **Order mailboxes** on a verified domain (count + platform Google/M365).
   Scalar builds the PremiumInboxes intake payload; with an API key it submits
   directly, without one it queues a fulfillment task with the exact CSV. Every
   new mailbox enters `warming` with a 30-day ramp and a conservative daily cap.
3. **Warm** automatically: the scheduler sends ramp-volume mail through Bird,
   tracks placement signals, and flips mailboxes to `ready` only when the ramp
   completes with clean signals. Burned/bouncing mailboxes auto-pause into
   recovery.
4. **Run sequences** from the CRM: agent picks contacts (or a segment), picks a
   variant-tested opener (`select_variant`), enrolls. Sends rotate across ready
   mailboxes under per-mailbox daily caps, stop on reply, stamp
   `lastContactedAt`, and write to the unified thread (`ContactEmail` +
   `Activity`), so the Conversations card stays the one relationship history.
5. **Replies** arrive via the Bird webhook → enrollment pauses (stop-on-reply),
   contact moves CONTACTED → REPLIED, activity logged, agent woken via
   `taskWebhookUrl`.

## Safety invariants (non-negotiable, mirror breakup-drafts)

- **Agents queue; humans release.** MCP/REST enqueue sends as `pending_approval`
  by default. Transmission happens only for enrollments with `approvedAt` set
  through the session-gated REST approve route — never an MCP tool — so a
  prompt-injected agent can never send cold email unilaterally. (Founder Call:
  per-sequence auto-send opt-in.)
- **Suppression is checked at queue time AND send time.** Bounced, complained,
  unsubscribed, or manually suppressed addresses never transmit. Bird-side
  suppression is defense in depth, not the only check.
- **Every send carries identity + exit.** `List-Unsubscribe` (one-click),
  physical-address footer requirement surfaced in the writing skill, and per-send
  provider message id stored for audits.
- **No secrets at rest.** Mailbox credentials live with the provider
  (PremiumInboxes/Bird); Scalar stores only provider refs + connection status.
  Same rule as API keys: refs are opaque, never logged.
- **Key-gated degradation.** No GoDaddy/Bird/PremiumInboxes keys → clean 501s
  (`Xxx is not configured`), never a bricked app. Same house pattern as
  Tavily/Exa/OpenAI.

## Data model (new tables only — `users` untouched)

- `OutreachDomain` — the purchased/connected domain + DNS verification state.
- `Mailbox` — one sending identity; lifecycle
  `ordered → provisioning → warming → ready → paused | burned`; daily cap +
  per-day counters; warmup day pointer.
- `MailboxWarmupDay` — per-day ramp ledger (sent/opened/replied/bounced,
  placement signal) so warmup is auditable, not a vibe.
- `OutreachSequence` — steps JSON (delay days, template refs, variant pool),
  `requireApproval` (default true), stop-on-reply, daily cap.
- `SequenceEnrollment` — per-contact state machine
  (`active → paused | completed | bounced | replied | unsubscribed`),
  `nextRunAt`, `approvedAt` (the human release).
- `OutreachSend` — every queued/transmitted message: mailbox, snapshot of
  subject/body, variant attribution, provider id, delivery status timeline.
- `Suppression` — per-user email suppression list (bounce/complaint/
  unsubscribe/manual), checked twice per send.
- `DomainOrder` — Stripe-paid domain purchase intent → GoDaddy registration
  receipt (idempotency key stored; webhook-completed).

User-side relation fields are Prisma-virtual only (no `users` DDL — see the
`voiceInboundSecret` lesson in `schema.prisma`).

## Sending pipeline (inngest, 15-min tick)

`processOutreachQueue`: due enrollments (approved, active, `nextRunAt <= now`)
→ suppression re-check → rotation pick (ready mailbox under cap, least-sent,
domain healthy) → Bird send (`marketing` category, unsubscribe headers) →
`OutreachSend.sent` + `ContactEmail` + `logOutreach`-equivalent stamp +
variant send attribution. `tickWarmup`: advance ramp days, adjust caps from
signals, flip ready/burned. Both ticks no-op cleanly when provider keys are
absent.

## Billing

- Domains: Stripe one-off (wholesale + disclosed markup) via checkout with
  order metadata; credits untouched.
- Mailboxes (DFY): Stripe recurring add-on target ($4/mo Origami-parity is the
  proposal; **Founder Call** on final price + whether Stripe metered vs
  per-mailbox subscription).
- Sends: credit meter `outreach_send` (priced ~3x Bird unit cost, same margin
  rule as every other action); warmup volume is platform cost, metered at the
  same rate so it can't be abused as free sends. Misses (suppressed/skipped)
  are never charged — same "never charge a miss" policy.

## What this cycle does NOT do (debts, named)

- No dashboard UI beyond API+MCP (settings/outreach pages are the next cycle;
  REST is the contract they will build on).
- No PremiumInboxes live API verification (no key; adapter + manual queue now,
  `scripts/premium-inboxes-smoke.mjs` queued behind a real key — same pattern
  as `agentphone-smoke.mjs`).
- No Bird webhook signature verification against a live sample (HMAC verify
  implemented per docs; marked UNVERIFIED like agentphone was, loud-warn on
  shape drift).
- No dedicated-IP management UI (shared pool default; dedicated pools are a
  `ip_pool_id` field away once volume justifies it — **Founder Call**).
- No LinkedIn/social sequencing (email first; social DMs already logged via
  `log_social_message` and can join sequences later).
