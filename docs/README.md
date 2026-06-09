# Scalar — Knowledge Index

> The map of all deep context. `CLAUDE.md` (Tier 1) is always loaded; this index
> (Tier 2) is the single entry point to everything below, loaded on demand. For
> any task: *where does the knowledge live, and do I need it right now?*

## Foundation — the immutable inputs (owned by vision + the human)

| Doc | What's there | Read when |
|-----|--------------|-----------|
| `foundation/north-star.md` | The taste calibration — soul, five-second promise, the bar. The Ratchet reads this. | ✅ set — read for any desirability/taste call |
| `foundation/product.md` | **What Scalar is** — identity, moat, objects, capabilities, scope, model. The source of truth for what we're building. | ✅ set — read before any product/feature work |
| `foundation/valueprop.md` | **Positioning & messaging** — one-liner, differentiation table, pillars, voice. | ✅ set — read before any copy/positioning |
| `foundation/value-proposition.md` | Earlier value-prop notes (superseded by `valueprop.md`; kept for history) | ⚠️ legacy |
| `foundation/prd.md` | The build brief — features, rebrand, IA, integrations | ✅ set — read before feature work |
| `foundation/brand-kit.md` | Voice, look, feel | _not yet provided (colors set in `src/app/globals.css`; logo `public/logo.svg`)_ |
| `foundation/user-experience.md` | Flows, the felt experience | _not yet provided_ |

## Decisions — the memory of *why* (Gate Cards)

| Doc | What's there | Read when |
|-----|--------------|-----------|
| `decisions/heading.md` | The current aim — what to work on next. Ratchet reads this **first**. | Every session |
| `decisions/README.md` | The ledger: patterns that pass, debts owed, kills. Ratchet reads this. | Every session |
| `decisions/0001-foundation-and-rebrand.md` | Build Scalar on the fortitudo scaffolding; rebrand; Prisma/Clerk/Supabase stack | Revisiting the foundation |
| `decisions/0002-crm-on-prisma.md` | Remove agency app; Prisma migration; CRM contacts CRUD + email store | Revisiting the data layer / IA |
| `decisions/0003-entity-model-context-engine.md` | Entity model + Entity↔Contact; Synthoz client; build verified | Revisiting entities/enrichment |
| `decisions/0004-secure-mcp-and-api-keys.md` | Secure MCP server (12 tools) + per-user API keys + shared ops layer | Revisiting agent access / MCP |
| `decisions/0005-scalar-agent.md` | Scalar agent at `/agent` — OpenAI, 13 tools, fresh-context + pgvector vector memory | Revisiting the agent / memory |

## Working knowledge (grows with the product)

| Area | What's there | Owned by |
|------|--------------|----------|
| `product/` | Specs, flows, requirements as they evolve | Vision + the human |
| `engineering/` | Architecture, systems, interfaces, trade-offs | The engineer + the producer |
| `operations/` | Production, economics, go-to-market, metrics | The producer + the banker |

## Audits

| Doc | What it covers |
|---|---|
| [`engineering/repo-audit-2026-06-06.md`](engineering/repo-audit-2026-06-06.md) | Security + ops + PR-process audit of `main` and PRs #1–#18 |
| [`engineering/mcp-audit-2026-06-08.md`](engineering/mcp-audit-2026-06-08.md) | MCP connection audit: connectivity/protocol + tool coverage for external agents |
| [`engineering/scale-audit-2026-06-08.md`](engineering/scale-audit-2026-06-08.md) | Full scale-readiness audit (7 parallel auditors): fixes shipped + items owed before scale |
| [`engineering/claims-audit-2026-06-09.md`](engineering/claims-audit-2026-06-09.md) | Claims-vs-delivery audit: every public claim reconciled against the code; P0 integrity gaps |

---

**Maintenance:** update docs in the same breath as the change; one fact, one home;
date and status everything; index a new doc here the moment you add it. Stale docs
mislead — treat drift as a bug.
