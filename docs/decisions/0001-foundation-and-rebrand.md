# Gate Card 0001 — Build Scalar on the fortitudo scaffolding; rebrand + Prisma/Clerk/Supabase stack

Date: 2026-06-04 · Verdict: **SHIP** (groundwork) · Led by: vision

> Founding card. Covers three coupled decisions: (a) build Scalar — an
> agent-operated CRM; (b) reuse the `mosnin/fortitudov4` Next.js scaffolding as
> the base; (c) stack = Prisma ORM on Supabase Postgres, Clerk auth.
> Rungs: ASSERTED(0) · REASONED(1) · TESTED(2) · OBSERVED(3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | Founder's vision, sharpened into the North Star: a CRM where *agents are the operators*, not a chatbot bolted on. Real pain (dead CRMs + disconnected scrapers). No user reaction yet → owed. |
| ↳ 5-second gate | vision | PASS (provisional) | REASONED | Promise named — *quiet leverage, "already working for me."* Not yet observed on a built screen. |
| **Feasible** | engineer | PASS | REASONED | Scaffolding already runs Next.js 16/React 19/Clerk; AgentMail + MCP + Prisma are all standard integrations. Nothing requires invention. Not yet built/tested. |
| **Deliverable** | producer | PASS | REASONED | Reusing a working app skeleton skips undifferentiated build. Rebrand applied via single theming file + scripted string pass. `pnpm build` not yet run in this env. |
| **Viable** | banker | PASS (deferred) | ASSERTED→owed | Pricing/economics not set. Acceptable: this is foundation, not a ship-to-users moment. |

## The synthesis

- **Led by:** vision (this is a "should it exist / what is it" call — the founder's).
- **Tension:** speed (reuse the agency scaffolding) vs. fit (it's built around
  agency *projects/phases/invoices*, not contacts). Resolved: keep the shell,
  aesthetic, auth, and UI kit; the IA/feature restructure (Discover, CRM, agent,
  product context) is the next cycle.
- **Tie-break:** converged — reuse clearly beats greenfield for the undifferentiated 80%.

## Red-team (one adversarial pass)

- **Most-inflated rung:** the 5-second gate — claimed REASONED, but "quiet
  leverage" is unproven until a real screen exists. Held honest; owed to reality.
- **Strongest case for KILL:** "AI CRM" is a crowded, hype-soaked category. Counter:
  the wedge is *agent-as-operator on owned data with product understanding* — the
  explicit anti-clichés in the North Star. Survives, but must be *shown*, not said.
- **What we missed:** the scaffolding's agency-project model is a poor fit for a
  contacts CRM; carrying it unchanged would confuse. Flagged for the next cycle.

## Verdict & debt

- **Verdict:** **SHIP** the foundation (scaffolding imported, Ritual installed,
  full rebrand: name + white/charcoal + `#1E4D2B` + dagger logo).
- **Verification debt (REASONED → owed):**
  - `pnpm install && pnpm build` must pass once deps/env exist. _(eng)_
  - The five-second "quiet leverage" reaction — observe on a real screen. _(founder)_
- **Owed to reality (founder):** real-user desirability; pricing/economics; the
  domain name; a real logo/brand kit; confirmation of the IA restructure direction.
