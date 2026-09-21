# 0015 — Agent Outreach Mailboxes (domains + DFY inboxes + warmup + sequences)

> Native cold/warm email inside Scalar: users buy domains (GoDaddy) and
> mailboxes (PremiumInboxes done-for-you) in-platform; agents warm accounts and
> run sequences with rotation, suppression, and stop-on-reply — Origami-parity
> UX on Scalar's CRM moat. Core CRM untouched (additive only).

## Gate verdicts

| Gate | Verdict + rung | Evidence |
|---|---|---|
| **Desirable** (vision + human) | **PASS — reasoned** | Origami proves willingness to pay for sequencer-free-on-paid + $4 DFY inboxes + rotation/warmup built in; Scalar users already run "email relationships" via agents (AgentMail read-only, breakup drafts) with no native send path — the missing last mile. Sequencing lives where research lives = quiet leverage, matches North Star. |
| **Feasible** (engineer) | **PASS — reasoned** | GoDaddy v3 quote-execute domain purchase + DNS API (public docs, PAT auth); Bird Email API send/verify/webhook + managed warmup + suppression (public docs); PremiumInboxes DFY inboxes at $2.80–3.50 (BYO domains — hence the GoDaddy half). No provider key in hand, so clients are defensive-parse + key-gated 501 per house pattern (agentphone precedent). |
| **Deliverable** (producer) | **PASS — tested (code)** | New-tables-only Prisma models (no `users` DDL per the voice-secret lesson); provider clients + ops layer shared by REST/MCP/inngest (one-ops-layer pattern); `tsc` + `eslint` + `vitest` green. UI pages + live provider verification owed (named below). |
| **Viable** (banker) | **PASS — reasoned, Founder Calls open** | Domains = Stripe one-off at wholesale+markup; DFY mailboxes target $4/mo (Origami parity); sends on the credit meter at the 3x-margin rule; warmup metered so it can't be free-send abuse. Final mailbox price, Stripe product shape, and per-sequence auto-send default are Founder Calls. |

## What shipped this cycle
- Prisma: `OutreachDomain`, `DomainOrder`, `Mailbox`, `MailboxWarmupDay`,
  `OutreachSequence`, `SequenceEnrollment`, `OutreachSend`, `Suppression`
  (+ Prisma-virtual User relations only).
- `src/lib/outreach/`: `types`, `dns` (SPF/DKIM/DMARC builders + DoH
  verification), `warmup` (30-day ramp table + signals), `rotation`
  (eligible-mailbox picker), `godaddy` (availability → quote → register →
  poll + DNS), `premium-inboxes` (order payload/CSV intake + status adapter),
  `bird` (send/verify/webhook + HMAC verify).
- `src/lib/outreach-operations.ts`: one shared ops layer (purchase/search
  domains, order mailboxes, sequences, enroll, queue, due-send processing,
  Bird webhook intake, suppression) — REST, MCP, inngest all call it.
- REST: `/api/outreach/domains`, `/api/outreach/mailboxes(+/[id])`,
  `/api/outreach/sequences` (+ enroll/approve/send-test),
  `/api/webhooks/bird`; Stripe webhook learns `domain_order` checkout
  completion → GoDaddy registration → DNS publish.
- Inngest: 15-min `process-outreach-queue` + daily `tick-mailbox-warmup`,
  both no-op clean without keys.
- MCP tools: `list_mailboxes`, `order_mailboxes`, `mailbox_status`,
  `create_sequence`, `enroll_sequence`, `queue_send` (+ operating-loop
  instruction update). Sends enqueue as `pending_approval`; release is
  REST-only (breakup-drafts precedent).
- Skills: `scalar-outreach` (mailbox→warmup→sequence loop),
  `scalar-cold-writing` (copy + grading checklist).
- Env doctor `Outreach infrastructure` group + `.env.local.example` vars +
  `outreach_send` credit cost; unit tests for dns/warmup/rotation/validation.

## Debts owed to reality

1. **Founder — provider accounts & money:** GoDaddy PAT + billing profile;
   PremiumInboxes reseller/API terms (confirm API + $/inbox at our volume);
   Bird account (shared vs dedicated IP call); Stripe products for domains +
   mailbox add-on; final DFY price + auto-send default.
2. **Live verification:** `scripts/premium-inboxes-smoke.mjs` + Bird webhook
   signature + GoDaddy sandbox registration against real keys (clients marked
   UNVERIFIED until then, loud-warn on drift — agentphone precedent).
3. **`prisma db push`** for the new tables (additive only) + one live
   domain-search → mailbox-order → warmup-tick → test-send round trip.
4. **UI next cycle:** Outreach settings pages (domains, mailboxes, sequences,
   shared reply inbox) on top of this REST contract; CAN-SPAM footer +
   one-click unsubscribe copy review by counsel before cold volume.
5. NOT merged: bricks/microwave-ai (would bypass null-over-wrong),
   SignalForce-as-radar-replacement (radar stays; revisit as seed source).

## Note on the heading's hard rule

The Heading carries "no new surfaces, providers, or tools — moments, not
features." This cycle breaks it deliberately and only because the founder
ordered it: native outreach is the missing last mile of the agent loop, not
chrome. The rule stands for everything else.
