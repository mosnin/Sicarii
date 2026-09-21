# 0017 - Safe warmup + scale send path

**Date:** 2026-09-21 · **Status:** SHIPPED (code) · **Owner:** engineer (vision held the product cut)

## The decision

A mailbox is an identity. Scale is a scheduler, not a sequencer. Two inboxes
and two thousand inboxes use the same path: cursor-paginated list jobs, one
mailbox (or one send job) per origin call, per-mailbox hourly + daily caps,
warmup volume counted apart from cold, DNS posture before volume, health
auto-pause. We do not simulate opens, clicks, or peer-inbox reply rings.

Volume takes the **floor** of public provider limits. Default (new domain +
new inbox): warmup only until day 21, first ready cold day = 5, steady
ceiling 20. Not Instantly marketing 40-100. Evidence:
`docs/engineering/mailbox-warmup-limits.md`. Constants:
`src/lib/mailbox-warmup-limits.ts`.

## What shipped (code)

- Cursor-paginated `warmup-list`, `fulfill-list`, `send-slot-list`,
  `imap-list`, `dns-list` (page size 200). Cron enqueues one page, then
  the next cursor. Worker fans out `*-one` jobs.
- Mailbox health: `healthScore`, `nextEligibleAt`, `consecutiveFailures`,
  `pausedReason`. Auto-pause on SMTP repeats, bounce spike, SPF `+all`,
  missing MX.
- Separate `warmupSentToday` vs `sentToday`. Warmup cannot spend the cold
  budget. Cold cannot hide inside warmup. Hourly cap (default 8).
- Queued `MailboxSendJob` with idempotency key. `send_email` stays
  synchronous. Workspace concurrency 8.
- Real DNS lookups (SPF / DKIM / DMARC / MX) stored on Domain. Shown on
  `/mailboxes` as text, not icon badges.
- `doNotContact` on Contact. Bounce / unsubscribe set it. `send_email` and
  queued send refuse before the provider.
- RFC threading fields. Follow-ups keep the original subject.
- Inbound classifier: REPLY vs AUTO_REPLY vs OOO vs BOUNCE vs UNSUBSCRIBE
  vs WARMUP vs OTHER. Only REPLY writes CRM + bandit. Warmup never touches
  CRM.
- Thin IMAP poll (`imap-one`) via imapflow. Skip if no IMAP creds.
- Encrypt-on-write for AgentMail / AgentPhone keys. Plaintext still
  readable until rewritten.
- `/connect` listens for the first API-key or OAuth write.
- Breakup approve still tries live `sendOutreachEmail` first.

## What we did not ship

- Instantly sequencer, campaign engine, sender-pool UI, warmup peer network.
- Workers talking to Postgres. GoDaddy auto-register. Fake Premium Inboxes
  purchase API. Deals as a first-class rebuild. Invented Stripe / x402 /
  Clerk Orgs. Invented `/terms` legal copy.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Quiet leverage is "it already sent, and it landed." A burned domain is the opposite. Identity-safe send at 2 and at 2000 is the same product. |
| Feasible | PASS | tested | Unit tests: warmup vs cold remaining, health pause, SPF +all, classifier, fan-out cursor, idempotent queue, DNC refuse-before-provider, tenant isolation. Not observed on a live fleet. |
| Deliverable | PASS | reasoned | Additive schema + ALTER IF NOT EXISTS. Worker is env-gated. Origin still runs jobs inline. Founder must `prisma db push` and `wrangler deploy`. |
| Viable | PASS | reasoned | Slower send preserves the inbox add-on. One ruined domain costs more than a week of waiting. No new default paid vendor. |

**Tie-break:** vision over "match Instantly's 30-40/day so we look serious."
Five honest sends beat forty junked ones. Scale the clock, not the blast.

## Red-team

- **Most-inflated rung:** Feasible is tested in process, not observed. We
  have not watched Postmaster, a 2000-inbox drain, or a live warmup hour.
- **Strongest case for KILL:** writing a ramp and a queue without live mail
  is astrology. Rebuttal: shipping unbounded collect + 40/day as the leftover
  table *is* the reckless act.
- **What we missed:** a founder-owned "already warm" attestation can be
  wrong. BYOK still caps at 25 and still stops on bounce or auth fail.

## Debts owed to reality (founder)

- `prisma db push` for health, DNS, DNC, jobs, RFC, IMAP columns.
- `wrangler` login, create queues if missing, deploy Worker, set
  `WORKERS_URL` + `WORKER_SECRET`.
- Stripe mailbox / domain prices. GoDaddy / Premium Inboxes keys. Do not
  turn on `GODADDY_AUTO_PURCHASE`.
- One live warmup: new domain, DNS passing, sink mail for 21 days, then
  five real cold sends. Record bounce, complaint, placement.
- Encrypt-on-write is live; rotating existing plaintext AgentMail /
  AgentPhone keys is founder (save the key again in Settings).
- One live `/connect` handshake against a real MCP client.

## What we did not decide

- Peer-network warmup (killed in 0015 / 0016, stays killed).
- Turning Scalar into a sequencer.
- Raising the new-domain ceiling above 20 without observed placement.
- First-class Deal object (left for a later cycle).
