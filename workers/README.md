# Scalar mailbox jobs (Cloudflare Workers)

Background plane for agent mailboxes. The Next.js app still owns Prisma and SMTP.
This Worker owns the clock and the queues so warmup, inbound, fulfillment, and
async send keep running when nobody is hitting the site.

## Jobs

| Trigger | Queue / cron | Origin job |
|---|---|---|
| `20 * * * *` | fan-out to `scalar-send-email` | `warmup-one` per warming mailbox |
| `*/10 * * * *` | fan-out to `scalar-mailbox-fulfillment` | `fulfill-one` per pending order |
| Email Routing | `scalar-inbound-email` | `inbound-email` |
| `POST /enqueue` | routed by job type | `send-email` and the jobs above |

## Secrets (Worker)

```
npx wrangler secret put ORIGIN_URL --config workers/wrangler.jsonc
npx wrangler secret put WORKER_SECRET --config workers/wrangler.jsonc
```

`ORIGIN_URL` is the live Scalar origin (`https://tryscalar.xyz`).
`WORKER_SECRET` must match the Next.js `WORKER_SECRET` (or `CRON_SECRET`).

## App env

```
WORKERS_URL=https://scalar-mailbox-jobs.<account>.workers.dev
WORKER_SECRET=...same value...
```

When those are unset, Next.js runs jobs inline and Inngest still ticks warmup.

## Deploy (founder)

```
npx wrangler queues create scalar-send-email
npx wrangler queues create scalar-inbound-email
npx wrangler queues create scalar-mailbox-fulfillment
npx wrangler deploy --config workers/wrangler.jsonc
```

Point Cloudflare Email Routing for a mailbox domain at this Worker if you want
inbound without a partner webhook.
