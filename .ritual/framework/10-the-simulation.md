# Framework 10 — The Simulation & the Weave

> The council, made literal. Instead of one Claude *role-playing* five methods in
> one head, you spawn **isolated agents** — each a distinct mind that cannot see
> the others — let them solve the problem independently, then **weave** the best
> of each into one decision through the gates. It is the most powerful form of the
> Ritual's "escape the mean," and it exists because of a hard-won finding.

## Why isolation (the finding that forces this)

Divergence only pays if the options are *genuinely different*. The trap: ask one
model for "a few different directions" in one context and it produces
**fake-diverse** options that quietly converge on the same mean — we watched this
happen, agent after agent landing on the same idea. The math says best-of-`k`
selection lifts quality by `≈ σ·√(2·ln k)` **only when the k are truly
independent.** The single thing that guarantees independence is **isolation:**
minds that cannot see each other cannot converge. That is the whole reason the
Simulation exists — it manufactures real `k`, and the Weave captures it.

## When to run it (right-size first)

The Simulation is **N× the cost** of a normal cycle. Reserve it for the decisions
where escaping the mean is worth the most:

- **Run it for:** open-ended *creative / design / strategy* calls — "an
  Apple-level UI for this dashboard," "the core concept for X," "how should this
  feel." High-stakes, no obvious right answer, taste-heavy.
- **Don't run it for:** execution, well-defined problems, or anything where the
  answer is known. That's ceremony with a multiplier. Right-size (`framework/04`).

---

## Movement A — the Simulation Ritual

*Invoke:* `/simulation-ritual <brief>` (e.g. *"an Apple-level UI for this
dashboard"*).

1. **Cast the minds.** Choose **3–5 perspectives** suited to the brief — and
   *always include at least one "Opposite" and one "10×"* so convergence is
   structurally impossible. A strong default cast:
   - **The Visionary** *(Jobs)* — soul-first; the insanely-great, inevitable version.
   - **The Humanist** *(Norman)* — the most humane, frictionless, legible version.
   - **The Opposite** — invert the obvious approach entirely.
   - **The 10×** — what if this were 10× better, not 10% — different in kind.
   - **The Distant Field** — steal the structure from an unrelated domain
     (a doorman, a game, a cathedral, a record player).

2. **Isolate them.** Spawn each as its own sub-agent **in parallel, with no shared
   context** — they must not see the brief's "house answer," each other's work, or
   a common notes file. Independence is the product; protect it.

3. **Push each to the edge.** Every agent gets the same brief and one instruction:
   *run your perspective to the extreme, escape the mean, and do not hedge toward
   the safe middle.* Each returns: a **complete, concrete proposal**, the **one
   thing that makes theirs unrepeatable**, and its **honest weaknesses**.

4. **Collect, don't judge yet.** Gather all takes verbatim. Resist picking a
   favorite — the value is in the *spread*. Hand the set to the Weave.

---

## Movement B — the Weave Ritual

*Invoke:* `/weave-ritual` (runs automatically after a Simulation, or standalone on
any set of candidate takes).

The Weave is **not** "pick the best one." It is synthesis through the gates:

1. **Mine each take for its strongest part.** Name the single best element of each
   candidate — the minimalist's restraint, the maximalist's signature interaction,
   the engineer's constraint-insight, the distant-field's structural steal. Keep
   **provenance** (which mind it came from).
2. **Reconcile through the four gates.** Run the strongest parts together through
   **desirable → feasible → deliverable → viable.** Where two parts conflict, hold
   the tension and let **vision break the tie**. Cut anything that fails a gate —
   even a beautiful part — and say so.
3. **Synthesize one coherent thing.** The weave must be a *single, whole* design,
   not a Frankenstein of bolted-on parts. If the best parts don't cohere, that's a
   finding: pick the spine that does and graft only what fits.
4. **Red-team it** (`framework/05`) — which borrowed part is inflated? what did
   every mind miss? — then **stamp a Gate Card** with a `WOVEN FROM:` line listing
   which element came from which simulated mind, and the honest rungs.
5. **Hand to the founder, then implement.** The woven direction is a **Founder
   Call** on taste — surface it, get the nod — then build it (the Magic /
   post-decision implementation).

```
  ┌── SIMULATION (diverge, isolated) ──┐        ┌── WEAVE (converge, gated) ──┐
  │  ▣ Visionary    ▣ Humanist         │        │  mine best part of each     │
  │  ▣ Opposite     ▣ 10×    ▣ Distant │  ───▶  │  → run the 4 gates          │
  │  each alone · each extreme         │        │  → synthesize ONE whole     │
  └────────────────────────────────────┘        │  → Gate Card (WOVEN FROM:)  │
            real k, real divergence              │  → founder · then implement │
                                                 └─────────────────────────────┘
```

---

## The honest edges (owed to reality)

- **Cost is N×.** This is the Viable-gate debt. Right-size it; it is a scalpel for
  big creative calls, not a default.
- **Isolation can still partly converge** on briefs with one overwhelming answer.
  The mandatory Opposite/10× minds fight this, but if all five land in the same
  place, that *is* the signal — the mean is the answer, and the Weave says so
  instead of inventing difference.
- **The Weave is still one mind selecting.** The founder is the outside check on
  the woven taste call — that hand-off is the safeguard, not a flaw.

## Done when

- The brief was worth simulating (right-sized to a high-stakes creative decision).
- 3–5 *isolated* minds returned genuinely different, complete takes (incl. an
  Opposite and a 10×).
- The Weave produced **one coherent** design via the gates, with provenance and
  honest rungs on a Gate Card, and the founder confirmed the direction.
