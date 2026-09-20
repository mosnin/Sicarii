# Gate Card 0005 — The Scalar agent (chat with hands + vector memory)

Date: 2026-06-04 · Verdict: **SHIP** (build-verified) · Led by: vision → engineer

> Founder: "build the agent that uses those tools… token efficient: fresh
> conversation each refresh, vector search for past conversation + data context."
> Founder calls: **OpenAI** (LLM + embeddings) · **pgvector on Supabase**.
> Rungs: ASSERTED(0)·REASONED(1)·TESTED(2)·OBSERVED(3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | The headline flow ("find nail salons in Miami" → push to CRM) is the product's spark. Chat at `/agent` with suggestion chips. |
| ↳ 5-second gate | human | — | OWED | The spark must be *observed* on the deployed app once `OPENAI_API_KEY` is set. |
| **Feasible** | engineer | PASS | **TESTED** | `tsc` clean · `eslint` 0 errors · `next build` green. AI SDK **v6** verified against installed types (async `convertToModelMessages`, `tool({inputSchema})`, `toUIMessageStreamResponse`, `useChat`+`DefaultChatTransport`). |
| **Deliverable** | producer | PASS | REASONED | Agent tools wrap the **same `crm-operations`** as the MCP — no second implementation. Gated by `OPENAI_API_KEY`: app builds/runs without it (clear 503), memory no-ops. |
| **Viable** | banker | PASS | REASONED | Token-efficient by design: fresh context per load + `recall` (top-k vector) instead of replaying history → bounded prompt cost. |

## Design

- **Fresh context per load:** the client mints a `conversationId` (uuid) on mount;
  only the current session's turns are sent to the model.
- **Vector memory (pgvector):** `memory_chunks(embedding vector(1536))`; every
  user/assistant turn is embedded (`text-embedding-3-small`) and stored; the
  `recall` tool does cosine search (`<=>`) scoped to the user. Raw SQL via
  `$queryRaw`/`$executeRaw` (Prisma `Unsupported` type + `postgresqlExtensions`).
- **Tools (13):** `recall`, `search_web` (Tavily), `search_crm`, entity + contact
  CRUD, `enrich_entity` (Synthoz) — all userId-scoped through the shared ops.
- **Persistence:** `Conversation` + `Message` rows; assistant text saved on finish.

## Red-team

- **Most-inflated rung:** Feasible is TESTED for *build/types* only — the LLM loop,
  streaming render, pgvector similarity, and `db push` of the `vector` extension are
  **not runtime-verified** (need `OPENAI_API_KEY` + a live Supabase with pgvector).
- **Risk:** Supabase may require enabling the `vector` extension before `db push`
  succeeds; declared via Prisma `extensions = [vector]` to handle it, but unverified.
- **Strongest KILL case:** none — this is the product.

## Verdict & debt

- **Verdict:** **SHIP** — agent + vector memory built and build-verified.
- **Owed to reality (founder):** `OPENAI_API_KEY` on Vercel; `pnpm db:push` against
  Supabase (with pgvector enabled); then observe the five-second spark + a real
  end-to-end discover→enrich→push run.
