# 0015 - Agent mailboxes: the CRM your agents run now sends the mail too

**Date:** 2026-09-21 · **Status:** SHIPPED (code, sandbox-verified) · **Owner:** the engineer (code) + founder (provider accounts, live observation)

## The decision

Scalar's agents could already find, enrich, draft and log outreach - but the
last inch, the actual send, left the product. The operator pasted a draft into
Gmail or an external sequencer, and the reply landed somewhere Scalar could not
see. This cycle closes the loop: **agents get their own mailboxes, on their own
sending domains, bought and managed inside Scalar, with warmup and
deliverability guards the agent cannot talk its way around.** Modelled on what
origami.chat and AgentMail offer, kept inside "the CRM your agents run" rather
than becoming a sequencer.

Nothing existing was removed or reshaped. Every prior tool, route, and screen
is intact; mailboxes are additive.

### What was built

**Data (additive, `prisma/schema.prisma`)**
- `MailDomain` - a sending domain (bought via a registrar, or brought). Holds
  DNS posture (SPF / DKIM / DMARC / MX checks), registrar, AgentMail linkage.
- `Mailbox` - one sending identity. Provider `AGENTMAIL` (API inbox) or `SMTP`
  (Google Workspace / Microsoft 365 credentials Scalar holds, encrypted).
  Warmup day, daily cap, health score, per-day counters, lifetime `sentTotal`.
- `MailMessage` - every message in or out, threaded (`Message-ID`,
  `In-Reply-To`, `References`), with inbound classification.
- `MailboxOrder` - a purchase (domain or inboxes) with Stripe checkout state
  and fulfilment status, including `ACTION_REQUIRED` for vendors with no API.
- `Contact.doNotContact` + reason/timestamp - the one flag every send path
  checks first.

**Provider layer (`src/lib/mail/*`, `src/lib/agentmail.ts`)**
- `registrar.ts` - `DomainRegistrarClient` with **GoDaddy** and **Porkbun**
  adapters (availability, purchase, DNS records). Prices in USD cents; which
  one is live is env-decided.
- `agentmail.ts` - extended from read-only to full provisioning: inboxes,
  send/reply, domains, webhook verification (Svix). Thin `fetch`, verified
  against the installed SDK's types.
- `smtp.ts` - Nodemailer send + ImapFlow poll for credential-held mailboxes,
  plus "rescue warmup mail from spam" so warmup actually teaches the filter.
- `dns.ts` - resolves and grades SPF / DKIM / DMARC / MX for an owned domain.
- `classify.ts` - deterministic inbound classifier: `REPLY`, `BOUNCE`,
  `UNSUBSCRIBE`, `OUT_OF_OFFICE`, `AUTO_REPLY`, `WARMUP`, `OTHER`.
- `warmup.ts` - the policy as pure functions: warmup ramp 4 -> +3/day -> 40,
  **no cold mail before day 14**, fully warmed at day 42, health < 75 halves
  the cold cap, health < 50 pauses everything.
- `cold-email.ts` - the writing rules (`COLD_EMAIL_GUIDE`) and a deterministic
  linter that scores a draft and lists why it will underperform. Never blocks.
- `src/lib/secret-box.ts` - AES-256-GCM sealed secrets under `MAILBOX_SECRET_KEY`.

**Ops layer (`src/lib/mailbox-operations.ts`)** - the single door for every
surface, `userId`-scoped, following the `crm-operations.ts` pattern. `sendMail`
enforces, in order: do-not-contact -> tenant ownership of mailbox / thread ->
mailbox exists and is not `PAUSED`/`WARMING` (with the "reopens on day N" hint)
-> today's cold slot reserved atomically -> credits (`mail_send: 1`) -> provider
send -> mirror to `ContactEmail` + `Activity` + outreach log -> lint attached to
the result. Replies to a human are free and uncapped; follow-ups on our own
sent message stay in-thread but are still cold for capping and metering.

**Background (`src/inngest/functions.ts`)** - hourly warmup tick (peers on
other accounts or other domains preferred), 10-minute inbound sync for SMTP
mailboxes, delayed warmup replies, order fulfilment after Stripe payment.
Webhooks: Stripe `checkout.session.completed` with `kind=mailbox_order`;
AgentMail `message.received` / `message.bounced` / `domain.verified`.

**Agent surfaces** - MCP tools `list_mailboxes`, `create_mailbox`,
`list_sending_domains`, `quote_domain`, `send_email`, `reply_email`,
`read_inbox`, `get_email_thread`, `update_mailbox`, `review_cold_email`; the
same set (minus provisioning) on the in-app agent, whose prompt now requires
explicit operator approval before any send. New skill
`scalar-cold-outreach` (in `src/lib/skills.ts` and `plugins/scalar/skills/`).

**Operator surface** - `/mailboxes` dashboard page: domains with DNS posture,
mailboxes with warmup progress / health / today's budget and pause / cap
controls, buy-domain (registrar quote -> Stripe), add-own-domain, create
AgentMail inbox, import SMTP credentials (single or PremiumInboxes-style CSV),
order inboxes, unified inbox with thread expansion, and the order list with
`ACTION_REQUIRED` steps spelled out. REST under `/api/mail/*` for all of it.

## The provider decisions

Research ran against live docs in September 2026; the short version:

| Need | Chosen | Why | Rejected / deferred |
|---|---|---|---|
| Buy domains | **Porkbun** (recommended), **GoDaddy** (requested) | Porkbun: JSON API, dry-run, idempotency, DNS + webhooks in one place, near-cost pricing, no IP allowlist. GoDaddy: the founder asked for it and it works, but availability / pricing endpoints are gated to 50+ domain accounts. | Namecheap (IPv4 allowlist - hostile to serverless), Cloudflare Registrar (purchase API still beta) |
| API inboxes for agents | **AgentMail** | Purpose-built for agents, threads + webhooks + custom domains, already in the codebase as a BYO key. | Bird.com - **AUP forbids unsolicited mail**; suitable only for Scalar's own transactional mail, never for cold. Kill recorded below. |
| Google / Microsoft inboxes | **Import** (PremiumInboxes CSV or single SMTP creds) | PremiumInboxes has **no public API** - `/api` renders nothing, `/affiliates` 404s. The import path takes exactly the CSV they deliver. Orders for them are recorded and marked `ACTION_REQUIRED` with the manual steps. | Becoming a Google Cloud Channel / Microsoft CSP reseller - right at scale, wrong at zero customers |
| Warmup | **Own engine** (peer mailboxes across tenants and domains) | Keeps the flag inside Scalar; no per-inbox SaaS fee stacked on a $3 inbox. | Instantly / Smartlead / Warmup Inbox as a warmup backend - deferred, see below |

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | asserted -> reasoned | Directly requested, with a named competitor (origami.chat) that sells exactly this; closes the one gap where the agent had to hand work back to the human. |
| Feasible | PASS | tested | `tsc --noEmit`, `eslint` (0 errors on all touched files), `vitest` **556/556** (69 new across five mail suites), `next build` all green in-sandbox. Send guards pinned against a mocked database; registrar adapters against a mocked `fetch`. |
| Deliverable | PASS | reasoned | Additive schema only (4 models, 9 enums, 3 columns on `Contact`, 4 relations on `User`). Everything env-gated: no keys -> `/mailboxes` explains what to set and nothing 500s; agents get a clear 501-style error. Orders route through the existing Stripe webhook. |
| Viable | PASS | reasoned | Cold sends metered at 1 credit; replies free (they are the product working). Domain and inbox orders are pass-through at the registrar / vendor price plus a Stripe one-off - margin is the founder's call on the ad-hoc price. |

**Tie-break:** none needed.

## Debts owed to reality

Everything below is TESTED-in-sandbox or REASONED. Do not call this proven
until each is observed live:

1. **`prisma db push` on production** for the new models and `Contact`
   columns (and the `supabase-setup.sql` mirror, which already lags several
   earlier cards).
2. **One live AgentMail round trip** with the platform key: create inbox on
   `agentmail.to`, send to a controlled address, receive the reply via
   `/api/webhooks/agentmail`, see it classified `REPLY` in `/mailboxes`.
3. **One live Porkbun purchase** (needs a funded balance and one prior manual
   registration on the account) -> DNS records pushed -> AgentMail
   `domain.verified` fires -> `MailDomain.status` flips. Same for GoDaddy once
   the account clears the 50-domain gate; until then only DNS management and
   purchase (not availability) will work there.
4. **One PremiumInboxes CSV** imported end to end: SMTP verify passes, IMAP
   sync pulls mail, warmup tick sends and the peer's inbox receives it.
5. **Warmup policy calibration.** The numbers (4 -> 40/day, day 14 cold start,
   day 42 warmed) are the 2026 industry consensus, not observed on our own
   traffic. Watch `healthScore` and bounce counts on the first real cohort.
6. **Microsoft SMTP AUTH Basic is being retired** (disabled for existing
   tenants from late December 2026). Imported M365 inboxes with plain
   passwords will stop working then; XOAUTH2 or Graph `sendMail` is the
   replacement.
7. **Stripe one-off order webhook** observed live (the `kind=mailbox_order`
   branch) - fulfilment is idempotent by design but unobserved.

## Kills & deferrals (named, not silently dropped)

- **Bird.com for outreach - KILLED.** Its Acceptable Use Policy requires
  documented opt-in and reserves the right to demand proof within 24 hours;
  cold B2B mail is a violation, and it is shared-IP infrastructure where one
  bad sender hurts every customer. Fine for Scalar's own transactional mail
  later; never for agent outreach. Do not re-open.
- **Origami.chat integration - not possible.** No public API; it is the
  benchmark, not a vendor.
- **PremiumInboxes automation - not possible today.** No API, no partner
  program. Import path built instead; revisit if they publish one.
- **Third-party warmup backends (Instantly v2, Smartlead, Warmup Inbox)** -
  deferred. Instantly's DFY-accounts API would also give programmatic
  Google / Microsoft inbox provisioning (~$5/mailbox/month). The right move
  once the own-engine warmup shows its limits or once inbox volume justifies a
  flat-fee sequencer seat. The `MailboxProvider` enum and the ops layer are
  shaped so this is an adapter, not a rewrite.
- **Email verification providers** (MillionVerifier, Reoon) - deferred. The
  existing finder -> verifier waterfall (`BOUNCER_API_KEY`) stands; a
  verify-before-first-send step on `sendMail` is the natural follow-up.
- **Google Workspace / M365 provisioning as a reseller** - deferred to scale.
- **Radar upgrade (SignalForce), Clay-style enrichment (bricks, microwave-ai)**
  - out of this card's scope; surveyed, nothing pulled in. Separate cycles if
  wanted.
- **Radar / SignalForce-style intent signals feeding the observation line of a
  cold email** - the linter already refuses to *invent* an observation; wiring
  Radar signals into `review_cold_email` suggestions is the obvious next link.

## Patterns worth promoting

- **Deliverability guards live in the ops layer, not the prompt.** The agent is
  told the rules, but `sendMail` enforces do-not-contact, warmup, caps, and
  health regardless of what the model decides. Prompts are advice; ops are law.
- **Lint, don't block.** `review_cold_email` and the lint attached to every
  send result put the "why this will underperform" in the same turn as the
  action. Judgement stays with the agent and the operator.
- **Vendors without APIs get an honest `ACTION_REQUIRED` state**, with the
  manual steps written on the order, rather than a fake "provisioning" spinner.
