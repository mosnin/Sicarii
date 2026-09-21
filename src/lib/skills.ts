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
   webhook in Settings; handle the POST in your agent. The same webhook gets
   mail.reply / mail.bounce / mail.unsubscribe events from agent mailboxes.
4. To send and receive real email, add a mailbox at Settings > Mailboxes, then
   use list_mailboxes, review_cold_email, send_email, reply_email, read_inbox
   and get_email_thread. The scalar-cold-outreach skill is the playbook.

## Guardrails (always)
- Confirm before sending email or other high-stakes actions. send_email is a
  real send; get the operator's go-ahead on the draft first.
- Never attach enrichment to the wrong person or company. Verify name and company
  first; prefer nothing over a wrong value.
- Deduplicate before creating records (one company per domain).
`,
  },
  {
    slug: "scalar-cold-outreach",
    name: "Cold outreach from agent mailboxes",
    description: "Send, follow up, and reply from Scalar-managed mailboxes without burning them, and write cold email that gets answered.",
    content: `---
name: scalar-cold-outreach
description: Run cold email outreach from Scalar's agent mailboxes - capacity, sequencing, reply handling, and the writing rules.
---

# Cold outreach from agent mailboxes

Scalar gives agents real inboxes on lookalike domains, warms them up, caps them,
and watches bounces and complaints. You send through them with MCP tools; the
guards are enforced server-side, so your job is judgement and copy.

## Before you send
1. \`list_mailboxes\`: note each mailbox's status, \`coldRemainingToday\`, and
   health. WARMING mailboxes under day 14 cannot send cold mail yet. Zero
   mailboxes: ask the operator to add some on the Mailboxes page.
2. Pick the contact from the CRM (\`get_contact\`, \`list_emails\`). Never email a
   contact you have no verified email for, and never one marked do-not-contact
   (\`send_email\` refuses anyway).
3. \`select_variant\` (subject, opener) for the pool you are working, then write.
4. \`review_cold_email\` on the draft. Fix every warning. Repeat until clean.

## Sending
- \`send_email\` with \`contactId\`, \`subject\`, \`text\`, and the \`variantId\`. It
  costs 1 credit, mirrors the send onto the contact, advances them to CONTACTED,
  and returns the mailbox used plus its remaining allowance.
- Spread a batch across mailboxes and across hours; when a send is refused for
  capacity, the error says when it reopens. Schedule, do not retry.
- Follow-ups with no reply yet: \`reply_email\` with the messageId of YOUR OWN
  earlier send (read_inbox with direction OUTBOUND, or the id send_email
  returned). It threads under the original from the same mailbox, still counts
  as cold mail (capped, 1 credit), and must add new information. 3-4 touches
  over 10-14 days, then a graceful close.

## Replies
- Your task webhook gets \`mail.reply\` / \`mail.bounce\` / \`mail.unsubscribe\` as
  they land; \`read_inbox\` (classification REPLY) lists what needs you.
- \`get_email_thread\` first, then \`reply_email\` with the thread's messageId.
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
- \`list_sending_domains\` shows DNS posture; \`quote_domain\` checks availability.
  Buying is a human step (Mailboxes page); \`create_mailbox\` works on a domain
  that is already connected to AgentMail.
`,
  },
];

export function getSkill(slug: string): Skill | undefined {
  return SKILLS.find((s) => s.slug === slug);
}
