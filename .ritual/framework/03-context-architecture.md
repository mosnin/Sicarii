# Framework 03 — Context Architecture

> Step 4 of the Ritual. The high-performance documentation and context
> system that lets the product grow without the Ritual losing the plot.

A product accumulates knowledge faster than any context window can hold. The
difference between a session that's sharp on month six and one that's lost is not
a bigger model — it's a **disciplined context architecture**. This is that
system.

---

## The principle: progressive disclosure

Context is a budget. Spend it on what changes the current decision; keep the rest
one hop away.

```
CLAUDE.md          Always loaded.  Small. Identity + index + rules.
   │
   ├─ imports ──▶  Cohesion engine, value prop, brand voice (small, always-relevant)
   │
   └─ links  ───▶  docs/README.md  ──▶  the whole knowledge tree, loaded on demand
```

- **Tier 1 — always in context:** `CLAUDE.md` and its imports. Tiny, load-bearing,
  read every session.
- **Tier 2 — indexed, loaded on demand:** everything in `docs/`, reached through
  `docs/README.md`. Loaded only when the task needs it.
- **Tier 3 — the repo itself:** code, configs, assets. Read just-in-time via
  search and file reads.

The skill is keeping Tier 1 ruthlessly small so it's always affordable, while
making Tier 2 so well-indexed that the right detail is always one hop away.

---

## The docs tree

```
docs/
├── README.md            THE INDEX — the map of all knowledge. Always current.
├── foundation/          Founding docs (Step 3). The immutable inputs.
│   ├── north-star.md     The taste calibration (the Ratchet reads this).
│   ├── brand-kit.md
│   ├── value-proposition.md
│   ├── prd.md
│   └── user-experience.md
├── decisions/           Gate Cards — one stamped verdict per significant decision.
│   ├── README.md         The ledger: patterns that pass, debts owed, kills. (Ratchet reads this.)
│   ├── heading.md        The current aim — what to work on next. (Ratchet reads this FIRST.)
│   └── 0001-example.md
├── product/             Specs, flows, requirements as they evolve.
├── engineering/         Architecture, systems, interfaces, trade-offs.
└── operations/          Production, economics, go-to-market, metrics.
```

**Stand up the spine (do this once, at setup):** create the tree above, and
**seed the three files the Ratchet reads** so retention works from day one — even
empty, they must exist or the hook has nothing to re-inject:

- `docs/foundation/north-star.md` ← `templates/north-star.md` (filled during intake, Step 3)
- `docs/decisions/README.md` ← `templates/decision-ledger.md` (the ledger, starts near-empty)
- `docs/decisions/heading.md` ← `templates/heading.md` (the first aim: usually "run the riskiest cheapest experiment")

Without these, the Ratchet greets every session with "no ledger yet" and φ stays
low. Seeding them is what arms the ratchet.

Each subtree maps to methods: `foundation/` & `product/` → Jobs + Norman;
`engineering/` → Musk + Ford; `operations/` → Ford + the banker. The owning method
keeps its subtree honest.

---

## docs/README.md — the index is the keystone

This single file is the entry point to all deep context. It is **not** a dump —
it's a map: for each area, one line on *what's there* and *when to read it*, plus
the link. A session reads the index, decides what's relevant, and loads only
that.

The index must answer, for any task: *where does the knowledge for this live, and
do I need it right now?* Keep it current or the whole system degrades — a stale
index sends sessions to the wrong place or nowhere.

---

## Decision records — the Gate Cards are the memory of *why*

The most expensive knowledge to lose is *why* a decision was made. In the Ritual,
the decision record **is the Gate Card** (`templates/gate-card.md`,
`framework/05-the-gate-card.md`): every significant decision gets a short, stamped
card in `docs/decisions/` — the four gate verdicts, the evidence rung behind each,
the five-second check, the tie-break, the verdict (SHIP/LOOP/KILL), and any
verification debt. It captures not just *what* and *why*, but *on what evidence*.

Cards are append-only history. Don't rewrite them; supersede them with a new one
and link back. This is how a session in month twelve understands month two without
re-litigating it.

**The cards compound — through the ledger.** Keep a rollup at
`docs/decisions/README.md` (from `templates/decision-ledger.md`): patterns that
keep clearing the gates (promote to defaults), debts still owed (gates left at
REASONED), and kills and why (the entries that stop you re-litigating bad ideas a
year later). This ledger *is the ratchet's memory*: the SessionStart hook
(`framework/07-the-ratchet.md`) re-injects it every session so gains don't leak as
context fills. Keep it ruthlessly short — it's read in full, every session. A
Ritual whose ledger compounds gets sharper with every decision; one whose ledger
rots compounds the wrong thing.

---

## Maintenance discipline — keeping memory honest

Stale docs are worse than no docs; they actively mislead. The rules:

1. **Update in the same breath as the change.** A code or product change isn't
   done until the docs and index reflect it. Treat doc drift as a bug.
2. **Single source of truth.** Each fact lives in exactly one place; everywhere
   else links to it. Never copy — duplication is how docs start lying.
3. **Date and status everything.** Especially decisions and specs. A reader must
   know if they're looking at current truth or history.
4. **Prune.** Delete or mark superseded what's no longer true. A lean, true tree
   beats a vast, rotting one.
5. **Index first.** When you add a doc, add its line to `docs/README.md` in the
   same change. An unindexed doc is invisible.

---

## How a session uses this system

1. Read `CLAUDE.md` → adopt the methods, learn what's being built, see the rules.
2. Read `docs/README.md` → get the map of deep knowledge.
3. Load only the `docs/` entries the current task needs.
4. Read code just-in-time via search.
5. On any significant decision → stamp a Gate Card and update the index.
6. On any material change → update the affected docs and `CLAUDE.md`.

This keeps every session warm, fast, and cohesive — no matter how large the
product grows.

---

## Done when

- The `docs/` tree exists with `README.md`, `foundation/`, `decisions/`,
  `product/`, `engineering/`, `operations/`.
- `docs/README.md` is wired into `CLAUDE.md` as the single deep-context entry
  point.
- The progressive-disclosure tiers and maintenance rules are written down (here,
  and summarized in `CLAUDE.md`).
- At least the foundation docs are indexed, and the Gate Card flow is in place
  (`docs/decisions/` with a rollup `README.md`).
- **The three Ratchet inputs exist and are seeded** — `docs/foundation/north-star.md`,
  `docs/decisions/README.md`, `docs/decisions/heading.md` — so a fresh session is
  re-injected with real memory, not "no ledger yet."
