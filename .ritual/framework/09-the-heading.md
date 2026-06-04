# Framework 09 — The Heading (point the vector efficiently)

> Planning and task execution, done the Ritual way. Not a second backlog that
> drifts from the gates — the **debts already are the backlog.** This is the
> discipline that orders and executes them so every unit of effort moves the
> product-value vector as far as possible. It runs *underneath* all three
> movements; it is the *how-fast* and *where-to-aim*, not a fourth movement.

## The objective, stated honestly

You have limited effort. You want to maximize **dV/d(effort)** — value gained per
unit of effort — which is steepest ascent of the product per unit cost. Every
inefficiency is effort spent in a direction that doesn't move the product, or
moves it and then loses the gain. There are exactly four sources of that waste,
and the Heading kills all four.

## What to do next — the priority function

The backlog is the **open debts** on your Gate Cards (the gates still at REASONED,
the `owed-to-reality` items, the failed gates). Rank them:

```
                 Alignment × Leverage × InfoValue
   Priority  =   ────────────────────────────────
                              Cost
```

- **Alignment** — does it serve the North Star? (How aligned with the taste
  vector.) Effort orthogonal to the soul is wasted however cheap. *Alignment is a
  Founder Call — only the founder sets true north.*
- **Leverage** — does it clear the **one binding constraint**? An hour on the
  bottleneck moves the whole system; an hour off it moves nothing. This term
  usually dominates.
- **InfoValue** — for anything unproven, *how cheaply could this falsify the
  idea?* The experiment that could kill you soonest, cheapest, has the highest
  information per unit cost. This is what makes the vector efficient *under
  uncertainty* — you test a direction before you march in it.
- **Cost** — effort/time. The denominator the Altar already drives down ("the
  smallest thing that converts belief into evidence").

## The four disciplines (one per source of waste)

| Source of inefficiency | Discipline | From |
|---|---|---|
| Working non-bottleneck tasks | **Constraint-first** — always work the one binding constraint, subordinate the rest | Theory of Constraints |
| Building before testing the riskiest assumption | **Cheapest-falsifier-first** — run the experiment that could kill it *before* you build on it | Expected Value of Information |
| WIP thrash (context-switching is variance, and variance is geometric-growth drag) | **WIP = 1 on the critical path** — finish before you start | single-piece flow (the producer) |
| Re-deriving the plan every session | **Retain it** — the Heading is carried by the Ratchet, not re-decided | the ratchet (`framework/07-the-ratchet.md`) |

## The artifact: the Heading

One tiny, always-current file — `docs/decisions/heading.md`, from
`templates/heading.md`. It answers three questions and nothing else, so it stays
glanceable:

```
1. The one binding constraint right now.
2. The next 1–3 tasks, ranked by Priority (with a one-glance L/I/Cost read).
3. The riskiest assumption currently under test (the cheapest falsifier).
```

It is *volatile* — it changes most cycles. (The ledger, by contrast, is the
*accumulated* memory: patterns, debts, kills.) Different cadence, different file.

## How it plugs into the loop

- **Pick:** at the start of a work cycle (`framework/04-development-loop.md`, the
  AIM step), the next task is the top of the Heading — not whatever's freshest in
  mind.
- **Surface first:** the Ratchet hook re-injects the Heading **before** anything
  else, so every session opens already pointed at the one thing that matters.
  Re-deriving the plan each session is vector drift; this removes it.
- **Update on RECORD:** when a cycle closes, update the Heading in the same breath
  — the constraint may have moved, the ranking may have changed, a falsifier may
  have resolved. A stale Heading points you the wrong way with confidence.
- **Confirm the aim:** the Alignment weights encode taste, so the founder
  confirms or adjusts the Heading's true north — a standing Founder Call.

## Why not a task board

A heavyweight tracker is the *mean* answer, and it actively fights the Ritual: it
becomes a second source of truth that drifts from the gates and the debts. The
first-principles answer is one number to look at — the Heading — derived from the
debts, ordered by the binding constraint and the cheapest falsifier, executed
WIP=1, and retained by the ratchet. The best planning system is the one with the
fewest moving parts that still points the vector.

## Done when

- `docs/decisions/heading.md` exists and names the binding constraint, the ranked
  next tasks, and the current riskiest assumption.
- The Ratchet hook surfaces it first, every session.
- Each work cycle pulls its next task from the Heading and updates it on RECORD.
- WIP on the critical path is held at 1.
