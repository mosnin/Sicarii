# Gate Card 0004 — Secure MCP server + per-user API keys + shared ops layer

Date: 2026-06-04 · Verdict: **SHIP** · Led by: the engineer

> Founder chose "MCP first," auth via "per-user API keys." This builds the secure
> MCP server, the key system, and a shared operations layer that REST, MCP, and
> the (next) agent all reuse. Rungs: ASSERTED(0)·REASONED(1)·TESTED(2)·OBSERVED(3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | The "agents plug into the context" soul. MCP + keys is the literal mechanism connected agents (OpenClaw/Hermes/Claude Cowork) use. |
| ↳ 5-second gate | vision | n/a | — | Back-end capability; the spark is the agent (next). |
| **Feasible** | engineer | PASS | **TESTED** | `tsc` clean · `eslint` 0 errors · `next build` exit 0 (`/api/mcp/[transport]`, `/api/keys` present). Built on `mcp-handler` + MCP SDK against their real types. |
| **Deliverable** | producer | PASS | REASONED | One **shared ops layer** (`crm-operations.ts`) backs REST + MCP + agent — no logic drift. Ownership scoped by userId in every op. |
| **Viable** | banker | n/a | — | Foundation. |

## Design

- **Auth:** per-user API keys, SHA-256 hashed at rest, plaintext shown once.
  `withMcpAuth` resolves the Bearer token → user → injects `userId` into the tool
  context. Same `authenticateApiKey` will guard a REST surface.
- **Tools (12):** list/get/create/update entities + contacts, `enrich_entity`
  (Synthoz), `save_email_context`, `search_crm`, `search_web` (Tavily). All
  userId-scoped via the shared ops; OpErrors become clean tool errors.
- **Endpoint:** `/api/mcp/mcp` (streamable HTTP), keys managed in Settings.

## Red-team (one adversarial pass)

- **Most-inflated rung:** Feasible is TESTED for *build*, but the MCP protocol
  handshake is **not runtime-verified** (needs a real MCP client + a key). Honest:
  that's the open debt.
- **Strongest case for KILL:** none — this is the connective tissue of the wedge.
- **What we missed:** rate-limiting on the MCP surface; scopes (all keys are
  full-access today). Acceptable for v1; tracked.

## Verdict & debt

- **Verdict:** **SHIP** — secure MCP + keys + tools + shared ops, build-verified.
- **Verification debt:** runtime MCP handshake + a tool call from a real client
  (needs deploy + a key). _(founder + eng)_
- **Owed to reality (founder):** Tavily/Synthoz keys to exercise those tools; an
  **LLM + embedding provider key** for the agent (next); MCP scopes decision later.
