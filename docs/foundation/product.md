# Product - Scalar

> **The CRM your agents run.** The single source of truth for lead intelligence
> and deal tracking - structured, enriched, and operated by AI agents.
> Status: living doc · owned by Vision + the human · read before any product work.

---

## In one breath

Scalar is **the CRM your agents run** - a structured database with a real UI and
built-in intelligence that an AI agent operates on your behalf: it discovers
leads, enriches every record, tracks deals, and runs email relationships. You
bring your own agent (over **MCP**) or use the built-in one; Scalar is the place
its work lands, stays consistent, and compounds.

## Who it's for

Anyone running an **AI agent who wants an intelligent CRM** to supercharge lead
intelligence and deal tracking. We don't gate by company size or role - the wedge
is *people already working with agents* who are tired of their data living in
chaos. Power users first.

## The problem we kill

Agents are great at *doing*, terrible at *remembering*. Today their output rots in
**messy markdown files and scattered notes** (the openclaw pattern): no schema, no
dedup, no UI, no consistency. You can't trust it, browse it, or build on it. The
agent re-researches the same company twice and contradicts itself.

Scalar gives that work a **home**: structured storage + a real interface + the
intelligence layer, so every agent action is consistent, queryable, and durable.

## The moat

**Structure + UI + intelligence, as one system.**

1. **Structured storage** - typed entities, contacts, deals, emails, and memory in
   Postgres, not free-text files. Deduped on the way in.
2. **A real UI** - humans can see, trust, edit, and navigate what the agent did.
3. **Built-in intelligence** - discovery, enrichment, intent, and research are
   first-class tools (we orchestrate the best providers), not bolt-ons.
4. **Agent-native by default** - a secure **MCP** surface + per-user API keys mean
   *your* agent operates the CRM directly, with the same ops layer the app uses.

Competitors own at most one of these. Enrichment tools (Clay/Apollo) aren't a CRM
and no agent runs them. Modern CRMs (Attio/Folk) are pretty but you still do the
work. Legacy CRMs (Salesforce/HubSpot) are heavy and agents can't natively drive
them. Agent frameworks dump to `.md`. Scalar is all four at once.

## The core value (the one magic)

**Agents do the busywork end-to-end** - discover → enrich → track → email -
operated by *your* agent, observed by you. The five-second spark: **connect your
agent over MCP and it just works**, reading and writing a clean, structured CRM
immediately.

## North Star metric

**Records enriched & added per active user** - the database compounding is the
proof the product is working. (Quality-gated: deduped, named, real.)

---

## Objects (the data model)

| Object | What it is | Status |
|---|---|---|
| **Entity** | A company. Enriched (firmographics, tech stack, funding, traffic, news, overview), deduped by domain. | Built |
| **Contact** | A person, ideally linked to an Entity. Enrich LinkedIn/email/phone per-field. | Built |
| **Deal** | An opportunity with stage + value, **advanced automatically by the agent** from activity. | Planned (today: status fields on records) |
| **Email** | Threads via **AgentMail**, surfaced on the contact; agent can save messages as durable context. | Built (basic) |
| **Memory** | Token-efficient vector recall over messages + CRM data so the agent stays consistent. | Built |

**Relationship rule:** contacts belong to entities. Unassigned contacts can be
**matched to a company** (research where they work → link, or create the entity -
never a duplicate).

## Capabilities

- **Discover** - one surface, many tools across providers, each result mapping to
  create-entity / create-entity-with-enrichment / create-contact / enrich-contact:
  - *Web intelligence:* web search (Tavily, default), Google SERP + scrape (Bright
    Data), crawl/extract (Tavily). Noisy results are **refined by a small model**
    into real companies (aggregators like Yelp dropped, deduped).
  - *Company intelligence:* search, firmographics, funding, tech stack, traffic,
    news, lookalikes (Explorium + Pipe0).
  - *People:* find people at a company, work email, mobile (Explorium + Pipe0).
  - *Intent:* **intent scanner** (Exa) - companies/people actively looking for what
    you sell; one-shot or **scheduled** (recurring monitors).
  - *Prospecting:* **find companies** from a prompt - Exa deep research returns
    CRM-ready companies; add one or **add all**, deduped vs results and CRM.
  - *Deep research:* Linkup sourced answers, schedulable as background jobs.
- **Enrich** - additive and multi-aspect; enriching one aspect never locks others.
- **Spawn contacts** - research a company's decision-makers and add the ones you
  don't have.
- **Schedule** - recurring intent monitors + research jobs run in the background
  (Inngest) and drop new, deduped records into the CRM automatically.
- **Agent** - built-in agent, plus a **secure MCP server** so any external agent
  can operate the CRM through the same shared ops layer.

## How agents are governed

Autonomy is **the user's call** - they connect their own agent via MCP. Scalar
provides **light, sane guardrails**: per-user API keys + ownership scoping, rate
limits, dedup/validation on writes (no null/junk records), and confirmation on
high-stakes actions (e.g. sending email). Trust by construction, not by lockdown.

## Architecture (today)

- **Stack:** Next.js 16 (App Router) · React 19 · TS · Tailwind v4 · Clerk auth.
- **Data:** Prisma on Supabase Postgres (+ pgvector for memory).
- **Intelligence:** Exa, Explorium, Pipe0, Bright Data, Tavily, Linkup; a small
  model (gpt-5-mini) refines noisy search into clean companies.
- **Scheduling:** Inngest (intent monitors, research schedules).
- **Email:** AgentMail (per-user key).
- **Agent access:** secure MCP server + per-user API keys, shared `crm-operations`
  layer so REST, MCP, and the in-app agent behave identically.

## Explicitly NOT (scope guardrails)

- ❌ Marketing automation (campaigns/newsletters/landing pages).
- ❌ Support / ticketing / helpdesk.
- ❌ Data warehouse / BI / generic dashboards.
- ❌ Our own raw data product - we **orchestrate** providers, we don't sell data.

## Business model

**Hybrid: seat + usage credits.** A base seat fee plus credits consumed by the
expensive operations (discovery, enrichment, agent runs) - so price tracks value
and provider cost.

## Data posture

**A single source of truth you control.** Enrichment flows *in* from providers;
your CRM is yours - owned, exportable, isolated per user (your provider keys), and
never resold or used to train others' models.

---

*Maintenance: update this doc in the same breath as the product changes. Mark
features Built vs Planned honestly. See `valueprop.md` for positioning/messaging.*
