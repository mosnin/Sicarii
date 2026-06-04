# framework/ — the depth, loaded on demand

You don't read these up front. The one-page cores ([`../RITUAL.md`](../RITUAL.md),
[`../ALTAR.md`](../ALTAR.md), [`../MAGIC.md`](../MAGIC.md)) and the engine
([`../methods/README.md`](../methods/README.md)) link in here only when a step
demands it. This is the map of what's here and when to open it.

## The bootstrap (run once, in order)

| # | Doc | Open it when |
|---|-----|--------------|
| 01 | [authoring-claude-md](01-authoring-claude-md.md) | writing the project's `CLAUDE.md` (Step 2) |
| 02 | [document-intake](02-document-intake.md) | taking in the founder's docs — North Star, brand, PRD, UX (Step 3) |
| 03 | [context-architecture](03-context-architecture.md) | standing up `docs/` and seeding the Ratchet's inputs (Step 4) |

## The build cycle (every cycle, forever)

| # | Doc | What it owns |
|---|-----|--------------|
| 04 | [development-loop](04-development-loop.md) | **the spine** — sequences the three movements; read this first to build |
| 05 | [the-gate-card](05-the-gate-card.md) | the evidence ladder + the Gate Card (the Ritual's verdict artifact) |
| 06 | [the-altar-loop](06-the-altar-loop.md) | the reduction — how the Altar grounds debts into proof |
| 07 | [the-ratchet](07-the-ratchet.md) | retention (φ→1) — the SessionStart hook + the ledger |
| 08 | [proving-the-framework](08-proving-the-framework.md) | the blind A/B that tests the framework's *own* claim |
| 09 | [the-heading](09-the-heading.md) | planning — pointing the vector efficiently (the debts are the backlog) |
| 10 | [the-simulation](10-the-simulation.md) | divergence at full power — isolated minds + the gated Weave (`/simulation-ritual`, `/weave-ritual`) |

## How they relate

```
01 → 02 → 03   set the project up (once)
        │
        ▼
   04  the cycle ───────────────────────────────────────────────
        ├─ Ritual   uses 05 (Gate Card) + the methods
        ├─ Altar    uses 06 (reduction)
        ├─ Magic    (../MAGIC.md)
        ├─ aim       uses 09 (the Heading)
        └─ retain    uses 07 (the Ratchet)
   08  proves the whole thing actually works (run it for real)
```

If a doc here ever re-explains what a core or another framework doc already owns,
that's drift — cut it. Single source of truth, depth on demand.
