# Scalar — Knowledge Index

> The map of all deep context. `CLAUDE.md` (Tier 1) is always loaded; this index
> (Tier 2) is the single entry point to everything below, loaded on demand. For
> any task: *where does the knowledge live, and do I need it right now?*

## Foundation — the immutable inputs (owned by vision + the human)

| Doc | What's there | Read when |
|-----|--------------|-----------|
| `foundation/north-star.md` | The taste calibration — soul, five-second promise, the bar. The Ratchet reads this. | ✅ set — read for any desirability/taste call |
| `foundation/value-proposition.md` | Who it's for, the value delivered, positioning | ✅ set |
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

---

**Maintenance:** update docs in the same breath as the change; one fact, one home;
date and status everything; index a new doc here the moment you add it. Stale docs
mislead — treat drift as a bug.
