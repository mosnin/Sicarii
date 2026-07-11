---
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

## Over MCP

The same flow for a connected agent, by tool name:
- `find_companies { query, count? }` - prompt to real companies, deduped by
  domain then name, added as entities. The prospecting tool.
- `maps_leads { query, location?, count? }` - local businesses from Google
  Maps, added as entities.
- `extract_contact_details { url }` - a site's public emails/phones/socials,
  returned for review (never auto-saved). Save keepers with `create_contact`.
- `google_search` / `search_web` - raw research results only, never records.
- Before discovering, read first: `search_crm { query }` or
  `list_entities { query?, limit? }` (limit 1-200, default 50; `search` is
  accepted as an alias for query). Building on existing records beats deduping
  after the fact.

## Rules
- Never save a record without a real name. Skip anything labeled unknown.
- One company per domain. Do not create duplicates.
