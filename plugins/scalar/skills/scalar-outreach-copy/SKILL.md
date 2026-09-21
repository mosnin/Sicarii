---
name: scalar-outreach-copy
description: Write and send outreach that is less likely to land in spam. Real identity, one question, honest unsub, no hacks.
---

# Outreach copy (hygiene, not hacks)

You are writing as a real person from a real mailbox. Filters and humans
both punish tricks. This skill is winning-writing plus legal hygiene, not
a spam-filter exploit list.

Companion skills: `scalar-mailboxes`, `scalar-safe-warmup`.

## Before you touch send_email

Run this checklist. If any box fails, draft only, or stop.

1. **Mailbox is allowed to send.** `list_mailboxes`: status `ready` (or
   operator marked ready). Not warming under day 21. Health clean.
   Remaining today > 0. See `scalar-safe-warmup`.
2. **Name AND company verified.** The To: address belongs to this person
   at this company. A work email must be on the company's own domain.
   If you cannot confirm both, do not send. Prefer "couldn't find it."
   This is the Scalar accuracy rule. Guessing an email is how you bounce.
3. **Not a role address.** Do not send to `info@`, `sales@`, `admin@`,
   `support@`, `noreply@`, `billing@`.
4. **Not a purchased or scraped list.** You found this person through
   Scalar discover/enrich, a referral, or the operator's own list.
5. **Identity matches.** From name + From domain are the mailbox. No
   spoofed From. No "via some-other-domain."
6. **Legal bits are in the body** (below).

## How to write

- **One idea, one question.** A reply should take five seconds
  ("not now" is a valid win).
- **Short.** Subject under ~50 characters. Body under ~800 characters
  of real sentences. `draft_outreach` already aims at this.
- **Specific.** Use their name and company because you verified them,
  not because a merge tag exists. No "Dear Sir", "To whom it may
  concern", "I hope this email finds you well."
- **Real identity.** Sign with the operator's real name and a real
  company. Include a **physical postal address** in the signature
  (CAN-SPAM). A PO Box the business actually uses is fine.
- **Honest unsub line.** Plain text, not a dark-pattern link.
  Example: `If this is not useful, reply "stop" and I will not write again.`
  Honor that. For campaigns that look like marketing, also include a
  one-click `List-Unsubscribe` header when the product supports it
  (Google bulk-sender rule from 2024-02-01; honor within 48 hours).
- **No link shorteners.** No bit.ly, t.co, tinyurl. Full https URLs, or
  no link at all on the first touch.
- **No fake `Re:` / `Fwd:`** on a first send. Follow-ups may use `Re:`
  only when they are actually a reply on the same thread.
- **No image-only mail.** No giant HTML. No tracking pixel on a new
  inbox. Prefer none at first even on a warm inbox.
- **No attachments** on the first touch. No vCard dump, no PDF deck.
- **No all-caps, no prize/urgent spam voice, no "open this immediately."**
- **Claims.** Only say what the operator's product actually does. No
  invented metrics, logos, or customer names.
- **One or zero links.** A calendar link can wait for the reply.

`outreachLooksHealthy` in `src/lib/mailbox-draft.ts` already flags a
long subject, a long body, a missing question, and generic openers.
Treat those warnings as blockers.

## Threading

- Follow-up uses the **same subject** (or a real `Re: original`).
- Same mailbox. Same thread. Not a new blast with a new hook.
- `list_emails` before the next touch so you do not double-send.
- `list_due_followups` finds who to chase. Do not invent a second
  first-touch.

## Length, claims, pixels, attachments

| Thing | First send | Later, after a reply |
|-------|------------|----------------------|
| Words | ~50-120 | Still short |
| Links | 0-1, full URL | Fine if relevant |
| Images | none | rare |
| Tracking pixel | none | prefer none |
| Attachment | none | only if they asked |
| Calendar dump | no | after they said yes |

## CAN-SPAM / CASL / Google bulk-sender checklist

Do this **before** `send_email`. You are responsible for the message.

**CAN-SPAM (US, FTC guide):**
- Accurate From and subject. No deceptive headers.
- Physical postal address in the message.
- Clear way to opt out. Honor it within 10 business days.
- You are liable for the list you use.

**CASL (Canada):**
- Consent (express, or a narrow implied basis). Cold B2B to a published
  work address is a legal call for the operator, not something you invent.
- Identify the sender. Mailing address + a way to contact.
- Unsubscribe that is readily performed. Honor within 10 business days.
  Contact info stays valid 60 days.

**Google sender guidelines (personal Gmail, rules from 2024-02-01):**
- SPF and DKIM aligned with From:. DMARC published (`p=none` is enough
  to exist).
- Spam rate in Postmaster: stay under 0.10%, never hit 0.30%.
- Marketing / subscribed mail at bulk: one-click unsubscribe, honored
  within 48 hours.
- Scalar inboxes should never approach 5,000/day. The auth and unsub
  habits still apply at 5/day.

If you cannot put a postal address and an honest unsub in the body,
do not send.

## What you must never do

- **Never claim you sent if `send_email` failed.**
- **Never send from a warming inbox** (day < 21) unless the operator
  marked it ready. Draft is fine. Send is not.
- **Never guess an email.** Verify name AND company, or stop.
- Never buy, rent, or scrape a list and pour it into `send_email`.
- Never fake urgency, a prior thread, or a mutual friend.
- Never BCC a crowd from an agent mailbox.
- Never "catch up" three days of missed volume in one hour.
- Never raise the cap because a vendor blog said 40-100/day.

## Agent loop (copy + send)

1. `list_mailboxes`. If nothing is ready, stop (see `scalar-safe-warmup`).
2. Confirm the contact: `get_contact` / CRM fields. Name AND company.
3. `list_emails` so you reply on a thread when one exists.
4. `select_variant` when a pool exists, then `draft_outreach`.
5. Rewrite so it is one question, signed, with postal address + unsub.
6. `send_email` with `contactId`, subject, body, `variantId`.
7. If it fails, say it failed. Do not `log_outreach` as if it went out.
