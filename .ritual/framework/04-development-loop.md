# Framework 04 — The Development Loop (the orchestration spine)

> Step 5 of the Ritual, and it never ends. This is the *thin spine* that sequences
> the three movements into one repeatable cycle. It does **not** re-explain the
> movements — each owns its own depth. This doc's only job is order, hand-offs,
> and the bar.

Foundation laid, methods lit, context wired. Now you build — but not the way a cold
assistant builds. Every *decision* runs the whole arc (small execution work does
not — see right-size below), so the product stays revolutionary as it grows
instead of decaying into a pile of features.

## Right-size first (before anything else)

The full arc is for **decisions**, not for every keystroke. Ceremony on trivial
work is its own waste. So triage in one breath:

- **Execution / reversible / obvious** — a bug fix, a rename, a clear small change.
  → **Skip the arc.** Apply the standing operating rules and just do it well. No
  gates, no Gate Card. The best step is no step.
- **A product decision — what to build, how it should feel, what to commit to,
  anything hard to reverse or that sets direction.** → **Run the full arc below.**

When unsure, treat it as a decision and run the arc. This keeps the rigor where it
pays and lifts the tax where it doesn't — the framework should never slow down the
work it isn't for.

## The cycle

One unit of work — a feature, a flow, a decision — flows through the arc in this
order. The order matters (an earlier version of this doc had it wrong): **you
stamp the Gate Card in the Ritual, with debts, and only then grind those debts on
the Altar.**

```
0. AIM      the Heading        what's worth doing now            → framework/09-the-heading.md
─────────────────────────────────────────────────────────────────────────────────
1. RITUAL   dream it           frame → design → run 4 gates →    → RITUAL.md
            (vision·human       STAMP the Gate Card (debts at      methods/README.md
             lead; taste ties)  REASONED)                          framework/05-the-gate-card.md
─────────────────────────────────────────────────────────────────────────────────
2. ALTAR    ground it          take the card's debts → reduce →  → ALTAR.md
            (engineer·producer  prove the smallest thing →         framework/06-the-altar-loop.md
             lead; truth ties)  discharge to TESTED/OBSERVED,
                                or return FALSIFIED → back to 1
─────────────────────────────────────────────────────────────────────────────────
3. MAGIC    make it real       ship the smallest whole →         → MAGIC.md
            (human leads;       founder observes the 5 seconds →
             reality judges)    MAGIC · FLAT→1 · MIRAGE→2
─────────────────────────────────────────────────────────────────────────────────
4. RECORD   retain & re-aim     file the card; update the ledger  → framework/07-the-ratchet.md
                                + the Heading                       framework/09-the-heading.md
─────────────────────────────────────────────────────────────────────────────────
        ↑ repeat — and next session the Ratchet re-injects the Heading + ledger first
```

The five methods aren't five sequential steps — they participate through the **four
gates** (desirable: vision·human · feasible: engineer · deliverable: producer ·
viable: the banker) in the Ritual, and as the **leads** on the Altar and Magic.
Where each lives is in `methods/README.md`; don't duplicate it here.

## The hand-offs (where cycles usually break)

- **Before SHIP — red-team the card.** On any significant decision, run one
  adversarial pass against your own Gate Card (which rung is inflated? strongest
  case for KILL? what did we miss?) and revise before stamping. It's the nearest
  thing to the outside check the model lacks. Full method: `framework/05-the-gate-card.md`.
- **Ritual → Altar:** the Gate Card is the membrane. The Ritual is *allowed* to
  leave gates at REASONED — but it must write them down as debts. A card with no
  debts and no OBSERVED evidence is a vibe, not a decision.
- **Altar → Ritual (FALSIFIED):** reality beats the vision — celebrate it, re-dream
  within the real constraints. Don't push a falsified claim forward.
- **Altar → Magic:** only when the load-bearing gates stand on TESTED/OBSERVED.
- **Magic → founder:** the spark is a **Founder Call** — observed, never asserted.
- **RECORD → next cycle:** if it isn't in the ledger and the Heading, it didn't
  happen; the Ratchet can only re-inject what you wrote down.

## Operating cadence

- **Small work:** run the arc lightly and fast — frame in a sentence, prove in
  minutes — but never skip the gates, the honest rung, or the RECORD.
- **Significant work:** run it deliberately, with a stamped Gate Card and a real
  Altar proof.
- **Always:** one voice to the founder. Deliberate as five; deliver as one. Surface
  taste, reality, and the final word as Founder Calls.

## The standing bar — a cycle is "done" only when

- **Desirable** — proud to put our name on it; the opening five seconds proven.
- **Feasible** — built at the limit; something actually *ran*.
- **Deliverable** — reproducible; the path *repeated*.
- **Viable** — it helps the product sustain and compound.
- …each at an **honest rung** (never faked), and it left a **Gate Card** and updated
  the **ledger + Heading**. Anything less is a draft wearing a "shipped" label.
  Loop again.

---

*Aim with the Heading. Dream on the Ritual. Ground on the Altar. Confirm in the
Magic. Retain with the Ratchet. Repeat — and compound.*
