# Gate Card 0003 — Entity model + context-engine data layer; build verified

Date: 2026-06-04 · Verdict: **SHIP** · Led by: the engineer (model by vision/human)

> Founder sharpened the product to a "context engine for leads + conversations
> that agents plug into for outbound cold email." This card adds Entities
> (businesses) + Entity↔Contact links, the Synthoz client + enrich path, and —
> crucially — **discharges the build-verification debt from 0002.**
> Rungs: ASSERTED(0) · REASONED(1) · TESTED(2) · OBSERVED(3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | Entities+Contacts is the right shape for B2B outbound; matches the refined founder spec exactly. |
| ↳ 5-second gate | vision | PASS (provisional) | REASONED | CRM tabs + "context engine" framing read clearly. Not yet observed on a deployed instance. |
| **Feasible** | engineer | PASS | **TESTED** | `tsc --noEmit` clean · `eslint` 0 errors · **`next build` exit 0, all 27 routes compiled**. Prisma client generates. |
| **Deliverable** | producer | PASS | REASONED | One ORM, ownership on every route, reproducible build. `prisma db push` to real Supabase still pending. |
| **Viable** | banker | n/a | — | Foundation; economics unchanged. |

## The synthesis

- **Led by:** the engineer (data model + verification); vision/human owned the
  entity/contact shape.
- **Tension:** ship Synthoz enrichment now vs. wait for a real response shape.
  Resolved: build the **request** path + store the raw payload now; gate behind
  `SYNTHOZ_API_KEY` (501 until set); parse responses into Contacts once we see real
  data. Honest partial beats a guessed parser.
- **Tie-break:** converged.

## Red-team (one adversarial pass)

- **Most-inflated rung:** Feasible — now genuinely TESTED (real `next build`), not
  asserted. Good.
- **Strongest case for KILL:** none — this is core plumbing for the wedge.
- **What we missed:** Synthoz/Tavily/AgentMail responses are unverified against real
  APIs; MCP not built yet; marketing copy still agency-flavored. All tracked.

## Verdict & debt

- **Verdict:** **SHIP** — Entity model + CRM(entities+contacts) + Synthoz client +
  enrich endpoint. Build verified.
- **Verification debt:**
  - `prisma db push` on real Supabase creates tables. _(founder env + eng)_
  - Synthoz response shape → Contact extraction. _(eng, needs sample)_
- **Owed to reality (founder):** Supabase/Synthoz/Tavily/AgentMail keys on Vercel;
  a sample Synthoz response; MCP auth decision; deployed 5-second observation.
