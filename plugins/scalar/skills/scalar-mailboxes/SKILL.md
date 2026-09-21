---
name: scalar-mailboxes
description: Buy or connect a mailbox, wait for warmup, then send real outreach from Scalar.
---

# Send from an agent mailbox

A mailbox is the agent's sending identity. Outreach that is only logged is not sent.

## Setup (human)

1. Open `/mailboxes`.
2. Add a domain you own, or search GoDaddy and buy one.
3. Request an inbox on that domain (Premium Inboxes) or connect SMTP.
4. Leave warmup running unless the inbox is already warm. The Cloudflare
   worker advances warmup and inbound in the background.

## Agent loop

1. `list_mailboxes`. If none are ready, stop and tell the operator.
2. `select_variant` for subject or opener when a pool exists.
3. `draft_outreach` for a short note (one question, no pitch dump).
4. `send_email` with `contactId`, `subject`, `body`, and `variantId`.
5. `list_emails` before the next touch. `list_due_followups` finds who to chase.

## Rules

- Never claim you sent if `send_email` failed.
- Do not send from a warming inbox (day < 21) unless the operator marked it ready.
- Respect the daily cap. Tomorrow is fine. Caps: `scalar-safe-warmup`.
- Confirm the contact's email is theirs (name AND company) before the first send.
- Write the body as a real person: `scalar-outreach-copy` (one question, postal address, honest unsub, no shorteners, no fake Re:).
