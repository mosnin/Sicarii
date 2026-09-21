# 0016 - Cloudflare Workers as the mailbox background plane

**Date:** 2026-09-21 · **Status:** SHIPPED (code) · **Owner:** engineer (vision held the product cut)

## The decision

Mailbox warmup, inbound ingest, and inbox fulfillment have to run when nobody
is on the site. Inngest can tick from the Next.js app. The founder asked for
Cloudflare Workers so that clock lives off the request path.

Research agents recommended staying on Inngest only. That is a sound default
for CRM crons. For mailboxes it is the wrong plane: send, warmup, and inbound
are a queue, not a page load. Vision deferred Instantly clones. The engineer
took the founder call: Workers for the mailbox jobs, Prisma/SMTP stay on the
origin.

## What shipped

- **Worker** `workers/` (`scalar-mailbox-jobs`): cron `20 * * * *` fans warmup
  to `scalar-send-email`; cron `*/10 * * * *` fans pending orders to
  `scalar-mailbox-fulfillment`; Email Routing and `POST /enqueue` land inbound
  and async send on queues. Each queue message is one origin job.
- **Origin** `POST /api/internal/jobs` (WORKER_SECRET / CRON_SECRET) runs
  `warmup-one`, `send-email`, `inbound-email`, `fulfill-one`.
- **Inbound webhook** `/api/webhooks/inbound-email` plus Email Worker parse.
  Matched From addresses call `saveEmail` (REPLIED + bandit). Unmatched senders
  stay on the mailbox event log.
- **Fulfillment poll** hits Premium Inboxes `GET /orders/:id` when partner
  keys exist. Local `local_*` orders stay requested. No fake SMTP.
- **Inngest warmup** skips when `WORKERS_URL` + secret are set, so the two
  clocks do not double-send. Hourly event guard is a second latch.
- **Breakup approve** attempts `sendOutreachEmail` first, then the honest
  log-only fallback.

## What we did not ship

- Workers do not talk to Postgres. Nodemailer is Node. Hyperdrive would
  duplicate the ops layer. The Worker is the scheduler, not a second CRM.
- No Instantly sequencer, no warmup network, no Bird as the default send path.
- Queues are created on deploy. This environment cannot log into Cloudflare.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | The mailbox is a voice. A voice that only talks while a tab is open is not a voice. |
| Feasible | PASS | tested | Job parse, secret compare, inbound match/unmatch, email parse, cron fan-out, Inngest skip, enqueue fallback. |
| Deliverable | PASS | reasoned | Additive indexes. Worker is env-gated. Origin still works with jobs inline. |
| Viable | PASS | reasoned | No new vendor bill on the critical path. Cloudflare is optional until the founder deploys the Worker. |

**Tie-break:** founder asked for Workers. Research said Inngest. Workers won
for mailbox background only. Radar and autopilot stay on Inngest.

## Debts owed to reality

- Founder: create the three queues, `wrangler deploy`, set `ORIGIN_URL` +
  `WORKER_SECRET` on the Worker, `WORKERS_URL` + `WORKER_SECRET` on the app.
- Point Email Routing at the Worker for a live inbound domain, or POST
  `/api/webhooks/inbound-email`.
- One live hour: a warming SMTP inbox should emit a `warmup` or `clock` event
  without anyone opening `/mailboxes`.
