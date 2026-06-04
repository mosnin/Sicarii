# PRD — Sicarii (build brief)

> The product requirements, captured from founder intake 2026-06-04. Owned by
> vision + the human (what/feel) and the engineer + producer (how). Living doc —
> refine each cycle. Large detail lives here; `CLAUDE.md` only links.

## 1. What we're building

A **CRM operated by AI agents**. The built-in agent (and connected external agents
like OpenClaw, Hermes, Claude Cowork) discover leads, enrich the database, run
email relationships, and read/write all records. All data stays inside Sicarii.

## 2. Foundation: rebrand from scaffolding

Base is the founder's `fortitudov4` scaffolding (a marketing site + logged-in
dashboard, originally for a real-estate agency). **Keep the UI and aesthetic;
rebrand only.**

- **Name:** Fortitudo → **Sicarii** everywhere (marketing + app).
- **Color scheme:** background **white** (light) / **charcoal** (dark) depending
  on mode; **primary `#1E4D2B`** (deep green).
- **Dashboard:** keep the logged-in aesthetic; retune all copy/messaging to
  Sicarii's positioning ("The CRM your agents run").
- ⚠️ _Blocked: need access to `mosnin/fortitudov4` (private). See Heading._

## 3. Navigation / IA changes

| Old | New | What it does |
|-----|-----|--------------|
| **Builds** (nav entry) | **Discover** | Find contacts using built-in tools (enrich, lead-gen from domain, extract from URLs, find-emails) and **save** them into the CRM. |
| **Builds** (page) | **CRM** | Display all saved contacts; entry to each contact record. |

## 4. Core features

### 4.1 Discover
Find-and-save flow, modeled on the Synthoz enrichment patterns the founder shared:
- Enrich company data by **domain**.
- Convert **company names** → enriched records.
- Extract **email / phone / social** from a list of **website URLs**.
- Find emails from **first name + last name + company/domain**.
- Daily registered domains w/ lead info; B2B list building (later tiers).
- Results are reviewable and **saved into the CRM** as contacts.
- _(Underlying data providers TBD — engineer to spec. Synthoz screenshots are the
  UX reference, not necessarily the backend.)_

### 4.2 CRM (contacts list)
- List/table of all saved contacts with enrichment fields.
- Each contact opens a **contact page**.

### 4.3 Contact page
- Full enriched profile.
- **Email thread store:** the conversation between the agent and that contact,
  which the agent can **save as context** and reuse.
- Emails render **from the connected AgentMail account** (see 4.5).

### 4.4 Built-in agent (chat)
- User chats with an in-app agent to **pull lead lists** and **enrich** the DB.
- Agent has **read + write** access to CRM data (it edits, updates, uses records).
- Agent draws on the Product Context store (4.6) to act with understanding.

### 4.5 Agent connectivity + email
- **MCP tools / skills** exposing the CRM so external agents (OpenClaw, Hermes,
  Claude Cowork) can operate the same data.
- **AgentMail integration:** user connects their AgentMail **API key in Settings**;
  email send/receive + thread display flows through it. Follow the API reference:
  https://docs.agentmail.to/api-reference  _(integration spec owed — engineer to
  read docs and define endpoints/auth/storage in `docs/engineering/`)._

### 4.6 Product Context store
- A **comprehensive, structured** section describing the product being sold.
- Readable by the internal agent **and** connected agents, so outreach is informed.
- This is a North-Star differentiator (understanding over spray) — design it as a
  first-class, agent-consumable knowledge base, not a notes field.

## 5. Settings
- AgentMail API key connection.
- (Likely) agent connection / MCP credentials, product-context management.

## 6. Out of scope / open questions (Founder Calls owed)
- Backend data providers for Discover (who supplies enrichment?).
- Auth/multi-tenancy model (inherited from scaffolding? confirm).
- Pricing & packaging.
- Which agent framework powers the built-in chat agent.

## 7. North-Star guardrails (every feature checks against these)
- Data never leaves Sicarii. Agents **act**, not just summarize. No
  understanding-free spam. The human directs; the agent operates.
