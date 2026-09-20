---
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
