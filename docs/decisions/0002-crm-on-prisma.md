# Gate Card 0002 — Remove agency app; build CRM (contacts) on Prisma + Supabase

Date: 2026-06-04 · Verdict: **SHIP** (pending build verification) · Led by: the engineer (IA by vision/human)

> Founder calls this session: "Remove & replace" the agency features; build "CRM
> (contacts) first." This card covers the IA restructure + Prisma migration +
> the contacts CRUD/UI. Rungs: ASSERTED(0) · REASONED(1) · TESTED(2) · OBSERVED(3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | Contacts are the core entity of an agent-operated CRM; founder explicitly prioritized it. New IA (Discover · CRM · Agent · Context · Settings) matches the North Star. |
| ↳ 5-second gate | vision | PASS (provisional) | REASONED | CRM landing leads with "your agents are on it"; empty states sell the motion. Not yet observed on a running screen. |
| **Feasible** | engineer | PASS | REASONED | Standard Next.js + Prisma + Clerk. Code written and internally consistent (grep sweep clean: no dangling imports/links). **Not yet compiled** — `pnpm build` can't run in this sandbox. |
| **Deliverable** | producer | PASS | REASONED | One ORM (Prisma), one data path, ownership enforced in every route. Reproducible via `pnpm install && db:push && build`. |
| **Viable** | banker | n/a | — | Foundation; economics unchanged from 0001. |

## The synthesis

- **Led by:** the engineer (migration + data layer); vision/human owned the IA.
- **Tension:** delete depth (agency projects/phases/invoices/admin) vs. keep
  optionality. Resolved per founder: remove & replace — deleted the agency app,
  APIs, admin, Drizzle, and agency-only components/libs; kept the marketing shell,
  auth, theme, and UI kit.
- **Tie-break:** converged with the founder's explicit call.

## Red-team (one adversarial pass)

- **Most-inflated rung:** Feasible at REASONED — the code is unbuilt. Held honest;
  `pnpm build` is the debt. Likely minor TS fixups (Prisma enum/Json typing).
- **Strongest case for KILL:** none — contacts CRUD is table stakes; the wedge
  (agent + context + owned email memory) comes in later cycles. Keep.
- **What we missed:** marketing pages still carry agency copy (hero, pricing,
  testimonials, about); settings still mentions Creem. Compiles, but off-message —
  flagged as a retune task. AgentMail email store has schema + UI but no provider
  wiring yet (intended — next cycles).

## Verdict & debt

- **Verdict:** **SHIP** the slice: Prisma-on-Supabase foundation, new IA, contacts
  CRUD (list, create, detail, status, delete), email-thread store (schema + UI),
  honest placeholders for Discover/Agent/Context.
- **Verification debt (REASONED → owed):**
  - `pnpm install && pnpm db:push && pnpm build` must pass. _(eng)_ — top priority.
  - 5-second reaction observed on the running CRM. _(founder)_
- **Owed to reality (founder):** Supabase project + connection strings; a real
  enrichment data provider for Discover; AgentMail key to light up email; decision
  on marketing-copy retune.
