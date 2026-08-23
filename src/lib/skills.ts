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
`,
  },
];

export function getSkill(slug: string): Skill | undefined {
  return SKILLS.find((s) => s.slug === slug);
}
