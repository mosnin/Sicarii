# 0015 - Agent mailboxes: identity, purchase, warmup, send

**Date:** 2026-09-21 · **Status:** SHIPPED (code) · **Owner:** vision (engineer on the send path)

## The decision

Agents in Scalar could discover, enrich, and *log* outreach. They could not
send. A mailbox is now a first-class object: the agent's sending identity.
Humans buy or connect the inbox; warmup climbs on a clock; `send_email`
delivers and writes the same CRM trail `log_outreach` already owned.

This is not an Instantly/Smartlead clone. Sequences, Clay-style enrichment
rewrites, SignalForce radar, and Bird as a default provider were evaluated
and deferred. The wedge is one identity the agent can actually send from.

## What shipped

- **Schema (additive):** `Domain`, `Mailbox`, `MailboxEvent`; optional
  `ContactEmail.mailboxId`. Mirrored in `prisma/supabase-setup.sql`.
- **Purchase:** Stripe add-on checkout (`STRIPE_PRICE_MAILBOX` monthly,
  `STRIPE_PRICE_DOMAIN` one-time). Webhook branches on `metadata.type` so a
  mailbox purchase never applies a plan. Premium Inboxes adapter posts a live
  order when `PREMIUM_INBOXES_API_KEY` + URL are set; otherwise the mailbox
  is `requested` for fulfillment. GoDaddy search/suggest when credentials
  exist; auto-register stays off (`GODADDY_AUTO_PURCHASE`).
- **BYOK SMTP:** connect an existing inbox; passwords AES-256-GCM encrypted
  (`MAILBOX_SECRET`, fallback to existing signing secrets).
- **Warmup:** day-based ramp (5 → 40/day, ready at 21). Inngest hourly tick
  advances the clock and sends to `WARMUP_SINK_EMAIL` / per-mailbox targets
  when SMTP is present. Honest `clock` events when it cannot deliver.
- **Send:** `send_email` (MCP + in-app + REST) delivers via SMTP / AgentMail /
  Bird, then `saveEmail` + `logOutreach`. Daily cap enforced first. 2 credits
  on a successful send. Inbound `saveEmail` now attributes replies (closes
  the 0013 email-reply debt).
- **UI:** `/mailboxes` in nav. Domain search/add/buy, request inbox, connect
  SMTP, pause/resume/mark ready, warmup bar.
- **Tools:** `list_mailboxes`, `get_mailbox`, `search_domains`,
  `draft_outreach`, `send_email`, `pause_mailbox`, `resume_mailbox`.

## What we did not ship (on purpose)

- Premium Inboxes has no public purchase API. We did not fake one. The
  adapter is a documented partner contract plus pending-fulfillment.
- GoDaddy registration is irreversible. Search is live; charge-and-register
  is founder-gated.
- Bird is an optional send adapter, not the product.
- SignalForce / bricks / microwave-ai / sequencer clones: existing Radar,
  enrichment waterfall, and variant bandit already cover those jobs.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | The product thesis is agents that run email relationships. Logging is not sending. First five seconds on /mailboxes: a domain, an inbox, warmup already moving. |
| Feasible | PASS | tested | Unit tests for warmup math, draft craft, crypto round-trip, tenant isolation, cap-before-send, ready-path logging. MCP gating pins the new write tools. |
| Deliverable | PASS | reasoned | Additive schema only. Every provider is env-gated (501 / pending, never a brick). Stripe mailbox metadata is a separate webhook branch. |
| Viable | PASS | reasoned | Inbox is a Stripe add-on (margin on provision). Send is 2 credits (floor). Warmup is unmetered. No new default paid provider required to ship the UI. |

**Tie-break:** vision over "also integrate Clay/Bird/SignalForce." One identity
beats a pile of vendors.

## Red-team

- **Most-inflated rung:** Viable is reasoned, not observed. No live Stripe
  mailbox price or Premium Inboxes partner key exists in this environment.
- **Strongest case for KILL:** buying inboxes is a fulfillment business, not
  software. Rebuttal: Scalar already is the CRM the agent runs; the missing
  piece was the mouth, not another sequencer.
- **What we missed:** live deliverability. Warmup without a sink is a clock.
  Named as debt.

## Debts owed to reality

- `prisma db push` for the new tables.
- Founder: `STRIPE_PRICE_MAILBOX`, `STRIPE_PRICE_DOMAIN`, GoDaddy keys,
  Premium Inboxes partner API if they grant one.
- One live round-trip: connect SMTP (or fulfill a webhook), wait or mark
  ready, `send_email` to a real contact, confirm the thread and variant
  attribution.
- Warmup mail only leaves the building when SMTP + a sink/target exist.
