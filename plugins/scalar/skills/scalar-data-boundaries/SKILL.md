---
name: scalar-data-boundaries
description: What you may read inside a tenant, what may leave it for a third party, and what may never land on a person's record.
---

# Data boundaries in Scalar

One principle: **the boundary is egress, not reading.**

Inside the tenant you are working in, read everything. It is the operator's own
data. A signature block, a thread reply, a call transcript, a past note: that is
first-party evidence, and it beats anything a data vendor will sell you. Reading
it is the job.

What is bounded is what LEAVES for a third party, and what gets WRITTEN onto a
person's record. Those two are permanent in a way that reading is not.

## Read first, always

Before you search the open web, search the CRM. `search_crm`, `list_contacts`,
`list_entities`, the contact's own conversation history. Most of the time the
answer is already there, it is more accurate than a vendor's guess, and it costs
nothing.

- Good: read the last three emails to work out that the renewal is blocked on a
  November rollout date, then search for "Northwind Logistics warehouse
  expansion 2026" to see what is public.
- Bad: search the open web for a company you already have twelve enriched fields
  on.

## The three egress rules

Every web search, discovery run, and enrichment call ships your string to a
company Scalar does not control: Exa, Tavily, Linkup, Firecrawl, Bright Data,
Apify, OpenAI, and more. Treat every one of those calls as publishing.

**1. Send a derived question, never pasted content.**
A question about a public fact is fine. The customer's own words are not.

- Good: `what did Acme announce about warehouse automation in 2026`
- Good: `Northwind Logistics hiring OR funding OR expansion`
- Bad: pasting the email thread and asking the search engine to summarise it
- Bad: `From: jane@northwind.example \n Subject: Re: Q3 renewal ...`
- Bad: `On Tue 14 Apr, Jane wrote: > we need the rollout before peak season`

Scalar blocks these before the request leaves. You will get a 400 that says the
query contains message text. That is not an outage and retrying will not help.
Read the record, work out the question, search for the question.

**2. Never send a raw identifier as a search term.**
An email address or a phone number in a search string is a person's identifier
handed to a search company for no gain.

- Good: `who is the VP of Operations at Northwind Logistics`
- Bad: `who is jane.whitfield@northwind-logistics.com`
- Bad: `reverse lookup 415-555-0134`

A name plus a company is fine, and is how the enrichment tools already work.

**3. Send the minimum that answers the question.**
Shorter queries are better searches anyway. If you find yourself pasting a
paragraph, you have not decided what you want to know yet.

## What belongs on a record

Business context only. The test: would you be comfortable if the person whose
record it is read the field out loud in a meeting?

**Record this:**
role and seniority, company, industry, location, website, work email and work
phone, deal stage, renewal date, budget cycle, tooling and tech stack, what they
said they need, objections, next step, who else is on the buying committee.

**Never record this** (GDPR Article 9 special categories, plus criminal history
under Article 10):

| Category | Never write |
|---|---|
| Health | conditions, diagnoses, medication, disability, pregnancy, addiction, mental health, why they were off sick |
| Political opinions | who they vote for, party membership, activism |
| Religion or belief | faith, observance, why they will not meet on a given day |
| Sexual orientation | orientation, partner's gender, anything about their sex life |
| Racial or ethnic origin | ethnicity, race, immigration or visa status |
| Trade union membership | union membership, shop steward role |
| Criminal history | convictions, charges, arrests, background-check findings |

Scalar refuses these writes at the write path, whichever provider volunteered
them: an enrichment vendor, a scraped page, an LLM summary, or your own note.
The refusal names the category, never the value.

This is not squeamishness. A CRM that knows a customer's health status is a CRM
somebody has to explain, first to that customer and then to a regulator. No
sales question is answered by it.

### The line in practice

- Bad: `Deal slipped because he is undergoing chemotherapy until March`
- Good: `Deal slipped, buyer is out until March, revisit then`
- Bad: `Will not take meetings on Saturdays, he is a practising catholic`
- Good: `Prefers weekday meetings`
- Bad: `Procurement lead is a union member, expect resistance on the headcount clause`
- Good: `Procurement expects scrutiny on the headcount clause`

In each case the business fact survives and the special category is dropped. If
the sensitive detail is the only thing left, it was never a CRM field.

## When you hit a refusal

Both guards return an error you can act on, not a failure to retry.

- **"That query contains message text"** - you tried to send customer content
  outward. Derive the question and search again.
- **"Refused to write ... special-category personal data"** - you tried to put
  an Article 9 category on a record. Rewrite it as the business consequence, or
  drop it.

Do not route around either one by rephrasing until it passes. If a legitimate
search is being blocked, say so plainly to the operator: the thresholds are
deliberately loose and a real false positive is a bug worth reporting.

The human-facing version, including which third party receives what, is in
`docs/engineering/data-boundaries.md`.
