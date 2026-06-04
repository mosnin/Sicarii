# Framework 07 — The Ratchet (retention → compounding)

> The mechanism that turns a *plateau* into *exponential* growth. Everything else
> in the Ritual raises the per-step gain; the ratchet is what stops you giving the
> gain back. It is the single highest-leverage part of the system.

## The result that forces this to exist

Product quality compounds **multiplicatively** — each good decision multiplies the
value of every decision before it, and one catastrophic decision can zero the
whole product. Work in log-quality `y = ln Q`. Across a session and across
sessions, `y` moves under a drift `g` (the gains the Ritual, Altar, and founder
produce) and a *leak* back toward the mean (the cliché the model regresses to as
context fills and memory fades):

```
dy/dt  =  g  −  κ(1 − φ)·y
```

`φ ∈ [0,1]` is **retention** — how much of each gain survives into the next
decision and the next session. Solve it:

```
φ < 1   →   y → g / (κ(1−φ))      a BOUNDED PLATEAU   (quality asymptotes)
φ → 1   →   y = y₀ + g·t          PURE EXPONENTIAL    (Q = Q₀·e^{g t})
```

The plateau multiplier `1/(1−φ)` is the whole game:

| φ | 1/(1−φ) | regime |
|---|---|---|
| 0.55 | 2.2× | plateau |
| 0.85 | 6.7× | plateau |
| 0.99 | 100× | plateau (steep) |
| 1.00 | ∞ | **exponential** |

So: **innovation is making `g > 0` (escaping the mean — the Ritual's job).
*Compounding* innovation is driving `φ → 1` (never falling back). The second is a
memory problem, not a thinking problem** — and memory is the thing that decays
silently as a project grows, exactly when the stakes are highest.

## Why retention leaks (and why instructions alone don't fix it)

As real work fills the context window, the meta-knowledge — the North Star, the
patterns that already passed, the debts still owed, the ideas already killed —
gets diluted and out-competed for attention by the immediate task. A session in
month six is the *least* likely to recall the decision from month two, so it
re-derives it (worse, or differently), re-opens settled questions, and pays gains
back. Telling the model "remember everything" does not raise φ; salience is not
governed by instruction.

## The ratchet: make retention a mechanism, not a hope

Three parts, working together:

1. **The ledger** — `docs/decisions/README.md` (from
   `templates/decision-ledger.md`): a tight, living summary of the retained
   memory — *patterns that keep passing*, *open debts owed to reality*, and
   *kills/falsifieds never to re-open*. The Gate Cards are the history; the ledger
   is what that history *means*, kept short enough to carry everywhere.

2. **The hook** — `.claude/hooks/ratchet.sh`, registered as a `SessionStart` hook
   in `.claude/settings.json`. It re-injects, at the start of **every** session:
   first the **Heading** (`docs/decisions/heading.md` — the one thing to push now;
   see `framework/09-the-heading.md`), then the **North Star**, then the **ledger**. This is what
   mechanically lifts φ: retention no longer depends on the model choosing to
   re-read the right files — the harness guarantees it, and the session opens
   already aimed.

3. **The discipline** — the loop's RECORD step (`framework/04-development-loop.md`, step 7) writes
   every significant decision's lesson back into the ledger in the same breath as
   the change. Write-on-every-cycle + read-on-every-session = a closed retention
   loop.

```
   decision ──RECORD──▶ ledger (docs/decisions/README.md) ──hook──▶ next session
        ▲                                                              │
        └──────────────── builds on retained gains ◀──────────────────┘
```

## The honest bound

The hook raises φ a lot, but not to a perfect 1 — context still has finite room,
and a founder can still choose to re-litigate. Treat φ as something you *engineer
upward*, not a switch. Two rules keep it climbing:

- **Keep the ledger ruthlessly short.** It is read in full every session; if it
  bloats, it stops being retained (it gets skimmed). Prune as hard as you promote.
- **A stale ledger is negative retention** — it compounds the *wrong* thing.
  Update it in the same breath as the change, or delete the line.

## Install

- **Clone-and-go:** the hook and `.claude/settings.json` ship in this repo; they
  work as soon as you open the project.
- **Vendored:** `install.sh` copies the hook into your repo's `.claude/` and
  merges the `SessionStart` registration into your `.claude/settings.json` (it
  never clobbers existing hooks).

The ratchet is the one part of the Ritual that reaches outside pure instruction
into the harness — because the math says retention is where compounding is won or
lost, and retention can only be *guaranteed* by a mechanism.

## Done when

- `docs/decisions/README.md` exists and is current (patterns, debts, kills).
- `.claude/hooks/ratchet.sh` runs at session start and re-injects it.
- The RECORD step writes to the ledger every cycle.
- The ledger stays short enough to be read in full, every time.
