// Premade skills that teach an agent how to operate Scalar. Surfaced on /skills
// where users can copy them or download as .md to drop into their own agent.

export interface Skill {
  slug: string;
  name: string;
  description: string;
  content: string; // markdown
}

export const SKILLS: Skill[] = [
  {
    slug: "scalar-discover",
    name: "Discover leads with Scalar",
    description: "Find companies and people and add them to the CRM, deduped and enriched.",
    content: `---
name: scalar-discover
description: Find companies and people with Scalar and add them to the CRM.
---

# Discover leads with Scalar

Use Scalar's Discover tools to turn a goal into real, CRM-ready records.

## When to use
- You need new accounts or contacts for outbound.
- You want in-market companies, not a raw list of links.

## How to work
1. Start broad with "Find companies": describe the ideal customer and pick a
   count. Scalar returns named companies with industry, location, phone, website,
   and key decision makers.
2. Review the results. Add the strong ones individually, or "Add all" to bulk-add.
   Duplicates (by domain) are skipped automatically.
3. For a specific company, open it and use "Analyze website" to pull people from
   their site, or "Spawn contacts" to research decision makers.
4. Prefer the AI-refined web search over raw search: it drops directories and
   aggregators and returns actual companies.

## Rules
- Never save a record without a real name. Skip anything labeled unknown.
- One company per domain. Do not create duplicates.
`,
  },
  {
    slug: "scalar-enrich",
    name: "Enrich entities and contacts",
    description: "Add firmographics, tech stack, funding, and verified contact info, accurately.",
    content: `---
name: scalar-enrich
description: Enrich companies and people in Scalar without ever attaching the wrong record.
---

# Enrich entities and contacts

## Entities
- Open a company and use the Enrich menu to add aspects independently:
  firmographics, tech stack, funding, website traffic, overview, news.
- Each aspect merges into the record; running one never blocks the others.

## Contacts
- On a contact, fill missing fields only: Find LinkedIn, Find email, Find phone.
- Email and phone require the contact to be tied to a real company domain
  (their website, linked company, or a corporate work email).

## Accuracy (non-negotiable)
- Enrichment must match the RIGHT person and company. Verify name AND company
  before saving. A work email must be at the company's own domain.
- If a confident match cannot be made, do nothing and say "couldn't find it".
  A wrong value is never acceptable.
`,
  },
  {
    slug: "scalar-link-contacts",
    name: "Keep the CRM clean",
    description: "Link contacts to companies, dedupe, and bulk-enrich the right way.",
    content: `---
name: scalar-link-contacts
description: Keep Scalar tidy: link people to companies, dedupe, bulk-enrich.
---

# Keep the CRM clean

Scalar is built around the contact-to-entity relationship. A contact is most
useful when it belongs to a company.

## Steps
1. For any unassigned contact, use "Match to company". Scalar finds where they
   work and links them, creating the company if needed (never a duplicate).
2. Use search + sort on the CRM page to find records fast. "Smart sort" ranks by
   how well results match your query; "Score fit" rates each record 0-100 against
   your Product Context.
3. To enrich many at once, select records and use Bulk enrich. Confirm the usage
   prompt first; already-filled fields are skipped.

## Rules
- Match by domain first, then name. Never create a second company for the same
  domain.
`,
  },
  {
    slug: "scalar-intent-monitors",
    name: "Schedule intent and research",
    description: "Run recurring intent scans and deep research that drop into your CRM.",
    content: `---
name: scalar-intent-monitors
description: Set up recurring intent monitors and background research in Scalar.
---

# Schedule intent and research

## Intent monitors
- From Discover, run "Intent scanner" with what you sell, then "Schedule
  recurring". Scalar re-runs it and adds new in-market companies automatically,
  deduped.

## Background research
- From "Deep research", schedule a recurring job. Target a specific contact or
  entity to keep its notes fresh, or leave it open to add new sources as records.

## Notifications
- Set an "Agent notifications webhook" in Settings. When a scheduled task
  completes, Scalar POSTs the new results to your URL so your agent can wake up
  and act on them.
`,
  },
  {
    slug: "scalar-mcp-agent",
    name: "Connect your agent (MCP)",
    description: "Operate Scalar from your own agent over MCP, with safe guardrails.",
    content: `---
name: scalar-mcp-agent
description: Drive Scalar's CRM from an external agent via MCP and webhooks.
---

# Connect your agent (MCP)

Scalar is the CRM your agents run. Point your own agent at it over MCP.

## Setup
1. Create an API key in Settings.
2. Connect Scalar's MCP server in your agent using that key. Your agent can now
   read and write entities, contacts, emails, and run discovery/enrichment
   through the same operations the app uses.
3. To get notified when scheduled tasks finish, set the Agent notifications
   webhook in Settings; handle the POST in your agent.

## Guardrails (always)
- Confirm before sending email or other high-stakes actions.
- Never attach enrichment to the wrong person or company. Verify name and company
  first; prefer nothing over a wrong value.
- Deduplicate before creating records (one company per domain).
- Mailbox send: follow scalar-safe-warmup (caps, warmup-only until ready) and
  scalar-outreach-copy (one question, postal address, honest unsub) before
  send_email.
`,
  },
  {
    slug: "scalar-mailboxes",
    name: "Send from an agent mailbox",
    description: "Give the agent a real inbox, warm it, and send cold email that lands on the contact.",
    content: `---
name: scalar-mailboxes
description: Buy or connect a mailbox, wait for warmup, then send real outreach from Scalar.
---

# Send from an agent mailbox

A mailbox is the agent's sending identity. Outreach that is only logged is not sent.

## Setup (human)
1. Open /mailboxes.
2. Add a domain you own, or search GoDaddy and buy one.
3. Request an inbox on that domain (Premium Inboxes) or connect SMTP.
4. Leave warmup running unless the inbox is already warm. The Cloudflare worker advances warmup and inbound in the background.

## Agent loop
1. list_mailboxes. If none are ready, stop and tell the operator.
2. select_variant for subject or opener when a pool exists.
3. draft_outreach for a short note (one question, no pitch dump).
4. send_email with contactId, subject, body, and variantId.
5. list_emails before the next touch. list_due_followups finds who to chase.

## Rules
- Never claim you sent if send_email failed.
- Do not send from a warming inbox (day < 21) unless the operator marked it ready.
- Respect the daily cap. Tomorrow is fine. Caps: scalar-safe-warmup.
- Confirm the contact's email is theirs (name AND company) before the first send.
- Write the body as a real person: scalar-outreach-copy (one question, postal address, honest unsub, no shorteners, no fake Re:).
`,
  },
  {
    slug: "scalar-safe-warmup",
    name: "Warm a mailbox without burning it",
    description: "Stay warmup-only until ready. Conservative daily caps. Stop on bounce, complaint, or auth fail.",
    content: `---
name: scalar-safe-warmup
description: Warm a Scalar mailbox safely. Stay warmup-only until ready. Never exceed the conservative daily cap.
---

# Safe warmup (do not burn the inbox)

A mailbox is the agent's sending identity. Warmup is a slow clock plus a
few real messages to a sink or named targets. It is not a peer-network of
fake opens. It is not Instantly.

Numbers below are the default profile (brand-new domain + brand-new inbox).
They are more conservative than Instantly marketing. When sources disagree,
send the lower number.

## When to start cold vs stay warmup-only

Stay warmup-only when any of these is true:
- list_mailboxes shows status warming and warmup day is under 21.
- The operator has not marked the inbox ready.
- DNS is dirty (SPF +all, missing MX, missing DKIM/DMARC).
- Health is paused (bounce spike, SMTP failures, auth fail).
- You do not have a verified contact email (name AND company).

Start cold only when status is ready (or operator marked ready), day is at
least 21 on a new domain, remainingToday has room, bounce is under 1%, and
there are zero spam complaints.

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

Aged domain + new inbox: day 7 cold=2, day 14 cold=5, day 21 cold=10, steady 25.
Already-warm BYOK: warmup=0, cold=25.

## Never exceed remainingToday / health

1. list_mailboxes before every send.
2. If remaining is 0, or status is paused/failed, stop.
3. Warmup mail and cold mail share the day cap.

## Stop immediately

Hard bounce, spam complaint, unsubscribe, SMTP/auth failure, SPF +all,
missing MX, or a sudden spike vs yesterday.

## One domain, few inboxes

2-3 inboxes per sending domain. Never blast a new domain from 20 inboxes on day 1.

## Agent loop

1. list_mailboxes.
2. If every inbox is warming and day < 21, do not send_email to contacts
   unless the operator marked it ready.
3. Respect remainingToday. Never claim you sent if send_email failed.

Companion: scalar-mailboxes, scalar-outreach-copy.
`,
  },
  {
    slug: "scalar-outreach-copy",
    name: "Write outreach that is less likely to be spam",
    description: "One question, real identity, postal address, honest unsub. No shorteners, no fake Re:, no guessed emails.",
    content: `---
name: scalar-outreach-copy
description: Write and send outreach that is less likely to land in spam. Real identity, one question, honest unsub, no hacks.
---

# Outreach copy (hygiene, not hacks)

You are writing as a real person from a real mailbox. Filters and humans
both punish tricks.

## Before you touch send_email

1. Mailbox is allowed to send (scalar-safe-warmup): ready, remainingToday > 0, health clean.
2. Name AND company verified. A work email must be on the company's own domain.
   Guessing an email is how you bounce. Prefer "couldn't find it."
3. Not a role address (info@, sales@, admin@, support@, noreply@).
4. Not a purchased or scraped list.
5. From name + From domain are the mailbox. No spoofed From.

## How to write

- One idea, one question. A reply should take five seconds.
- Subject under ~50 characters. Body under ~800 characters.
- Specific. No "Dear Sir" or "I hope this email finds you well."
- Sign with a real name. Include a physical postal address (CAN-SPAM).
- Honest unsub line: reply "stop" and I will not write again. Honor it.
- No link shorteners. No fake Re:/Fwd: on a first send. No image-only mail.
- No tracking pixel on a new inbox. No attachments on first touch.
- One or zero links. Full https URLs only.
- Only claim what the product actually does.

## Threading

Follow-up uses the same subject (or a real Re: original) on the same mailbox.
list_emails before the next touch. Do not invent a second first-touch.

## CAN-SPAM / CASL / Google checklist

- Accurate From and subject. Physical postal address. Working opt-out
  (CAN-SPAM: honor within 10 business days).
- CASL: consent is the operator's call. Identify the sender. Readily
  performed unsub. Honor within 10 business days.
- Google (from 2024-02-01): SPF/DKIM aligned, DMARC published, spam rate
  under 0.10% and never 0.30%. One-click unsub on marketing/bulk, honored
  within 48 hours.

If you cannot put a postal address and an honest unsub in the body, do not send.

## Never

- Never claim you sent if send_email failed.
- Never send from a warming inbox (day < 21) unless the operator marked it ready.
- Never guess an email.
- Never buy or scrape a list into send_email.
- Never fake a prior thread or a mutual friend.
- Never BCC a crowd or "catch up" three days of volume in one hour.
`,
  },
];

export function getSkill(slug: string): Skill | undefined {
  return SKILLS.find((s) => s.slug === slug);
}
