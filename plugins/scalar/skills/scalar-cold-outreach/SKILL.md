---
name: scalar-cold-outreach
description: Run cold email outreach from Scalar's agent mailboxes - capacity, sequencing, reply handling, and the writing rules.
---

# Cold outreach from agent mailboxes

Scalar gives agents real inboxes on lookalike domains, warms them up, caps them,
and watches bounces and complaints. You send through them with MCP tools; the
guards are enforced server-side, so your job is judgement and copy.

## Before you send
1. `list_mailboxes`: note each mailbox's status, `coldRemainingToday`, and
   health. WARMING mailboxes under day 14 cannot send cold mail yet. Zero
   mailboxes: ask the operator to add some on the Mailboxes page.
2. Pick the contact from the CRM (`get_contact`, `list_emails`). Never email a
   contact you have no verified email for, and never one marked do-not-contact
   (`send_email` refuses anyway).
3. `select_variant` (subject, opener) for the pool you are working, then write.
4. `review_cold_email` on the draft. Fix every warning. Repeat until clean.

## Sending
- `send_email` with `contactId`, `subject`, `text`, and the `variantId`. It
  costs 1 credit, mirrors the send onto the contact, advances them to CONTACTED,
  and returns the mailbox used plus its remaining allowance.
- Spread a batch across mailboxes and across hours; when a send is refused for
  capacity, the error says when it reopens. Schedule, do not retry.
- Follow-ups with no reply yet: `reply_email` with the messageId of YOUR OWN
  earlier send (read_inbox with direction OUTBOUND, or the id send_email
  returned). It threads under the original from the same mailbox, still counts
  as cold mail (capped, 1 credit), and must add new information. 3-4 touches
  over 10-14 days, then a graceful close.

## Replies
- Your task webhook gets `mail.reply` / `mail.bounce` / `mail.unsubscribe` as
  they land; `read_inbox` (classification REPLY) lists what needs you.
- `get_email_thread` first, then `reply_email` with the thread's messageId.
  Replies are free, uncapped, and threaded correctly.
- BOUNCE and UNSUBSCRIBE already marked the contact do-not-contact and
  attributed the outcome. Do not touch them again.

## Writing rules
- Under 75 words. Plain text. No links, images, or HTML in a first touch.
- Subject: 2-5 specific words ("the SDR hiring post"), never "quick question".
- Three lines: one concrete, verifiable observation about THEM from the record
  (never invented); one sentence naming the problem people in their seat have;
  one soft question ("worth a look?"). Never ask for 30 minutes.
- No "I hope this finds you well", no "my name is", no exclamation marks, no
  caps, no emoji, no "leverage / seamless / excited / revolutionary".
- No em dashes (the loudest machine-written tell), no "It's not just X, it's
  Y", no recap openers ("I noticed...", "Congratulations on...", "As the CEO
  of..."). Tell them something they do not already know.
- Follow-ups add something new (a proof point, an example) and rotate the
  angle. Never "just bumping".
- Close with a one-word exit ("a 'pass' is enough and I'll step out of your
  inbox"), never "I'll take silence as a no".
- Stop on reply, bounce, or opt-out. Honour "stop" instantly.

## Domains and inboxes
- 2-3 inboxes per lookalike domain; never the company's primary domain.
- `list_sending_domains` shows DNS posture; `quote_domain` checks availability.
  Buying is a human step (Mailboxes page); `create_mailbox` works on a domain
  that is already connected to AgentMail.
