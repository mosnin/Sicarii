---
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
