---
name: scalar-safe-warmup
description: Warm a Scalar mailbox safely. Stay warmup-only until ready. Never exceed the conservative daily cap.
---

# Safe warmup (do not burn the inbox)

A mailbox is the agent's sending identity. Warmup is a slow clock plus a
few real messages to a sink or named targets. It is not a peer-network of
fake opens. It is not Instantly.

Read the evidence: `docs/engineering/mailbox-warmup-limits.md`.
Numbers below are the **default** profile (brand-new domain + brand-new
inbox). They are more conservative than Instantly marketing. When sources
disagree, send the lower number.

## When to start cold vs stay warmup-only

Stay **warmup-only** when any of these is true:

- `list_mailboxes` shows `status: warming` and warmup day is under 21.
- The operator has not marked the inbox ready.
- DNS is dirty (SPF `+all`, missing MX, missing DKIM/DMARC).
- Health is paused (bounce spike, SMTP failures, auth fail).
- You do not have a verified contact email (name AND company).

Start **cold** only when:

- Status is `ready`, or the operator explicitly marked it ready, **and**
- Warmup day is at least 21 on a new domain (aged-domain exception below), **and**
- `remainingToday` / daily cap still has room, **and**
- Bounce rate is under 1% and there are zero spam complaints.

Aged domain + new inbox: first tiny cold (2) may start on day 7 if the
operator says the domain is aged (6+ months, site live, auth passing) and
health is clean. Default is still "wait."

Already-warm BYOK: operator attested it. Cap is 25/day. Still stop on
bounce, complaint, or auth fail. Still do not blast on day 1 of *your*
session.

## Daily caps (default: new domain + new inbox)

| day | warmupSends | maxColdSends | notes |
|-----|-------------|--------------|-------|
| 1 | 3 | 0 | DNS must pass. No cold. |
| 3 | 4 | 0 | Warmup only. |
| 7 | 6 | 0 | End of week 1. Still 0 cold. |
| 14 | 10 | 0 | Do not copy Instantly's 10-20 cold here. |
| 21 | 12 | 5 | Ready day. First cold is 5, not 40. |
| 30 | 5 | 15 | Keep a slice of warmup. |
| 31+ | 5 | 20 | Ceiling. Add a domain, do not raise this inbox. |

Aged domain + new inbox: day 7 cold=2, day 14 cold=5, day 21 cold=10,
steady 25. Already-warm BYOK: warmup=0, cold=25.

Code: `src/lib/mailbox-warmup-limits.ts`
(`warmupSendsForDay`, `maxColdSendsForDay`, `dailyTotalCapForDay`).

## Never exceed remainingToday / health

1. Call `list_mailboxes` (or `get_mailbox`) before every send.
2. Read `status`, warmup day, `dailySendLimit`, sent-today, remaining, health.
3. If remaining is 0, stop. Tomorrow is fine.
4. If status is `paused` or `failed`, stop and tell the operator.
5. Warmup mail and cold mail share the day cap. Cold cannot hide inside
   warmup.

## Stop immediately

Pause the mailbox (or tell the operator to) and send nothing more today if
you see:

- Hard bounce
- Spam complaint
- Unsubscribe (honor it, then stop mailing that address)
- SMTP / auth failure
- SPF `+all` or missing MX
- Sudden spike vs yesterday (do not "catch up" missed days)

## One domain, few inboxes

- Rule of thumb: **2-3 inboxes per sending domain**. Never 20 on day 1.
- Do not blast a new domain from every local-part at once. Stagger.
- Keep the primary brand domain off cold send when you can.

## Agent loop

1. `list_mailboxes`.
2. If none exist, stop. Tell the operator to add a domain and an inbox
   on `/mailboxes`.
3. If every inbox is `warming` and day < 21, **do not** `send_email` to
   contacts. Say that warmup is still running. Offer to draft, not send.
4. Exception: operator marked that inbox `ready`. Then use the ready-day
   cold cap (5 on a new domain's first ready day), not 40.
5. If an inbox is ready, pick one. Respect `remainingToday`.
6. Confirm the contact (see `scalar-outreach-copy`) before `send_email`.
7. Never claim you sent if `send_email` failed.

Companion skills: `scalar-mailboxes` (identity + tools),
`scalar-outreach-copy` (how to write so it is less likely to be spam).
