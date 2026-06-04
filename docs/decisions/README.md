# Decision Ledger — the ratchet

> The product's **retained memory** — re-injected every session by the Ratchet
> hook so gains compound instead of leaking. Keep it tight and current: it is read
> in full at the start of every session, so every line must earn its place. The
> individual Gate Cards in this folder are the history; this is the *living
> summary* of what that history means.

The rule: **build on the patterns, pay the open debts, never re-open a kill or a
falsified claim.** Re-litigating settled decisions is exactly the leak that turns
exponential growth into a plateau.

> The *current aim* — what to work on next — lives in the more volatile
> `heading.md`. This ledger is the *accumulated* memory; the Heading is *where the
> vector points right now*. The Ratchet surfaces the Heading first, then this
> ledger.

---

## Patterns that keep passing (promote to defaults)

> Moves that have cleared the gates more than once. These become the house style.

- **Reuse the working skeleton for the undifferentiated 80%; spend invention on
  the wedge.** Built Sicarii on the fortitudo scaffolding instead of greenfield. _(Card 0001)_
- **Brand color lives in one place.** All theme color flows from tokens in
  `src/app/globals.css`; rebrand = edit tokens, not hunt components. _(Card 0001)_
- **One ORM, one data path, ownership in every route.** Prisma only; every
  contact query is scoped by `userId`; API routes catch the `NextResponse` thrown
  by `getAuthenticatedUser`. _(Card 0002)_
- **Grep-sweep after a teardown.** After deleting modules, grep for dangling
  imports + dead route links before declaring done. _(Card 0002)_
- **Honest placeholders, not 404s.** Unbuilt nav destinations ship as branded
  "coming next" pages so the IA is whole. _(Card 0002)_

## Open debts (owed to reality)

> Gates currently standing at REASONED, waiting on evidence.

| Debt | Gate / Card | Evidence owed | Owner |
|------|-------------|---------------|-------|
| **Build passes** | 0002 · Feasible | `pnpm install && db:push && build` green; fix TS fallout | eng |
| 5-second "quiet leverage" | 0001 · Desirable | observe the reaction on a real built screen | founder |
| Desirability with real users | 0001 · Desirable | first real users react | founder |
| Economics | 0001 · Viable | pricing/packaging set | founder + banker |
| Supabase + Clerk env | 0002 | connection strings + keys provided | founder |
| Real enrichment provider | 0002 | provider chosen for Discover | founder + eng |

## Kills & falsifieds (do not re-open)

> Ideas killed by the Ritual or falsified by the Altar. Recorded with *why*.

| What | Verdict | Why (one line) | Card |
|------|---------|----------------|------|
| Drizzle + Neon DB layer | REPLACED | founder call: Prisma ORM on Supabase Postgres instead | 0001/0002 |
| Orange brand palette | REPLACED | rebrand to charcoal/white + `#1E4D2B` green | 0001 |
| "Fortitudo" agency identity | REPLACED | rebranded to Sicarii (agent-operated CRM) | 0001 |
| Agency app (projects/phases/onboarding/invoices/admin) | REMOVED | founder call "remove & replace"; wrong shape for an agent CRM | 0002 |

---

<!-- The hook reads this file verbatim each session. Prune ruthlessly: a stale
     ledger teaches every future session the wrong thing. -->
