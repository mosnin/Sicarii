# PRD — Scalar (build brief)

> Product requirements. Owned by vision + the human (what/feel), the engineer +
> producer (how). Living doc. Refined from founder intake 2026-06-04 (two rounds).

## 1. What we're building

**A context engine for leads + conversations that AI agents plug into (over MCP or
API) to run outbound cold email.** Scalar is a CRM whose operators are agents:
they discover businesses, enrich them and their people, hold the conversations,
and own all the context — on data that never leaves the system.

## 2. Core data model

- **Entity** = a business. Discovered (web search), enriched (by domain), operated
  on by agents. Has many contacts.
- **Contact** = a person. Assigned to an entity **or** solo.
- **ContactEmail** = an email exchanged with a contact (via AgentMail), savable as
  reusable agent context.
- **User** = the Scalar account (Clerk), owns entities + contacts.

All records carry an `enrichment` JSON payload and `notes`/`tags` so agents can
read and extend context freely.

## 3. Information architecture (dashboard)

Dashboard · **Discover** · **CRM** (Contacts + Entities tabs) · **Agent** ·
**Product Context** · Settings. Contact and Entity detail pages are reached from
the CRM (the contact/"user" page is intentionally not in the dock). _(IA shipped.)_

## 4. Features

### 4.1 CRM — shipped
- Entities tab (businesses, with contact counts) + Contacts tab (people).
- Entity detail: profile + its contacts + **Enrich** button.
- Contact detail: profile + linked entity + **email-thread store** (Conversation).
- Manual create for both; assign a contact to an entity; status + delete; per-user
  ownership enforced on every API route. CRUD APIs: `/api/entities(+/[id])`,
  `/api/contacts(+/[id])`.

### 4.2 Scalar agent (chat) — next
- Natural language → **Tavily** web search to find entities ("nail salons in
  Miami") → review → push to CRM.
- Tools: **enrich entity** (Synthoz, by domain → contacts), **enrich contact**
  (Synthoz, by entity domain → contact info), create entities/contacts, search CRM.
- Acts with read+write CRM access and Product Context.

### 4.3 Enrichment (Synthoz) — client ready, wiring next
- `src/lib/synthoz.ts` implements the documented request shapes (enrich-company,
  convert-company-names, extract-emails-from-urls, find-emails-first-last).
- `POST /api/entities/[id]/enrich` calls Synthoz by domain, stores the raw payload
  on `entity.enrichment`, marks ENRICHED. **Response→Contact parsing is TODO**
  (need a real response shape). Returns 501 until `SYNTHOZ_API_KEY` is set (Vercel).
- Manual "Enrich" button in the CRM + an agent tool both hit this path.

### 4.4 AgentMail (email) — schema ready, wiring next
- Connect API key in Settings; send/sync into `ContactEmail`; render real threads.
  Ref: https://docs.agentmail.to/api-reference

### 4.5 Secure MCP + tools — shipped (build-verified)
- Authenticated MCP server at `/api/mcp/mcp` exposing 12 tools over the CRM
  (entities, contacts, enrich, save email context, search CRM, search web) so
  connected agents (OpenClaw, Hermes, Claude Cowork) read/use context and write back.
- **Per-user API keys** (SHA-256 hashed, shown once) managed in Settings; Bearer auth.
- All tools + REST + the agent share `src/lib/crm-operations.ts` (one source of truth).
- Debt: runtime handshake verification from a real MCP client.

### 4.6 Product Context store — next
- Agent-consumable, structured knowledge of what's being sold; read by internal +
  connected agents before outreach.

## 5. Stack

Next.js 16 · React 19 · TS · Tailwind v4 · Clerk (auth) · **Prisma on Supabase
Postgres** · AgentMail (email) · Tavily (search) · Synthoz (enrichment). Build
verified (tsc + eslint + `next build` all green); `prisma db push` needs real
Supabase creds.

## 6. North-Star guardrails

Data never leaves Scalar. Agents **act** (read+write), not just summarize. No
understanding-free spam. The human directs; agents operate. Secure by default.

## 7. Founder Calls owed

Supabase creds · Synthoz key + a sample response · Tavily key · AgentMail key ·
MCP auth model · pricing · domain · real logo/brand kit · marketing-copy retune.
