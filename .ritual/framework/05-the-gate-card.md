# Framework 05 — The Gate Card & the Evidence Ladder

> The Ritual's closing move. Judgment is cheap; *verified* judgment is the whole
> game. This is the system that makes every gate collide with reality and leaves
> a verdict you can see.

Reasoning about a product is not the same as being right about it. A framework
that only *thinks* — desirable, feasible, deliverable, viable, all argued in the
head — is faith wearing a lab coat. The Gate Card forces each gate to cite
evidence, ranks how real that evidence is, and stamps a verdict that cannot be
skipped. It turns the Ritual from instruction into a closed loop.

---

## The evidence ladder

A gate is never passed by opinion. It is passed *at a level of evidence.* Name
the level, honestly, every time:

```
0 · ASSERTED   "I think so."                         ✗ Not a pass. This is a vibe.
1 · REASONED   Argued from first principles.          Honest, but unverified.
2 · TESTED     Checked against something executable    A test, a prototype, a
               — a test run, a working spike, a        calculation on real inputs.
               number computed from real inputs.
3 · OBSERVED   Checked against reality                 The app ran. A real person
               — the world actually answered.          used it. A real number came back.
```

**The one rule:** nothing significant ships on **ASSERTED**. A gate at
**REASONED** is allowed, but it is *verification debt* — written down, owed to
reality, and paid before scale. The bar for "great" is to climb to **OBSERVED**
on the gates that matter before you build at volume. A decision that never leaves
level 1 is a decision that has never been graded by the truth.

> The point of the ladder is honesty about altitude. "Feasible — I'm confident"
> is level 0 cosplaying as level 2. Say *which rung you're actually standing on.*

---

## The unforgivable act: never fake a rung

The whole system rests on one assumption — that the rung you name is the rung you
actually reached. So make it law:

**You may never claim evidence you did not gather.** Writing "OBSERVED — 4 of 5
users reached the aha" when no user ever existed is not a passed gate. It is a
lie with a stamp, and it is the *one unforgivable act* in the Ritual — worse than
a failed gate, because it looks rigorous while being false.

When you're building, reality is often out of reach: there are no users yet, no
telemetry, no production number. That is **fine** — but it must be *said*, not
papered over:

- Mark the gate at the highest rung you **honestly** reached (usually REASONED or
  TESTED), never higher.
- Record the rest as **OWED TO REALITY** — name the exact evidence that's missing
  and *hand it to the founder*: "I can't observe a first-run; this needs 5 real
  people in front of it before we scale." (`templates/gate-card.md` has the field.)
- A card built entirely of REASONED gates is honest and allowed — it just carries
  debt. A card with an *invented* OBSERVED rung is fraud. Treat the difference as
  absolute.

Honesty about evidence is not a nicety; it is the only thing that makes the loop
worth closing. A system that will lie to flatter you is worse than no system.

---

## The Gate Card

Every significant decision leaves one. It is short, glanceable, and stamped — the
deliberation made witnessable. Full template: `templates/gate-card.md`. The shape:

```
DECISION:  <one line>

┌ DESIRABLE   ── PASS · OBSERVED ── first-run watched: 4/5 reached the "aha" unaided
│  └ 5-second gate: opening moment proven? ── yes, storyboard tested on 3 people
├ FEASIBLE    ── PASS · TESTED   ── spike runs; access-control primitive proven in a test
├ DELIVERABLE ── PASS · REASONED ── one repeatable path designed; not yet run twice  ⚠ debt
└ VIABLE      ── PASS · TESTED   ── each share invites ~0.3 new users (from beta logs)

LED BY: vision · TENSION: producer wanted 5 flows, vision cut to 1 · TIE: n/a (converged)
VERDICT: SHIP   ·   DEBT: prove the delivery path reproduces before scaling
```

Cards live in `docs/decisions/` (they *are* your ADRs — see Framework 03). A
decision without a card did not clear the gates; it skipped them.

---

## The four gates now demand evidence

The order is unchanged (`methods/README.md`). What changes is that each gate must
name its evidence and its rung:

- **DESIRABLE** *(vision · the human)* — evidence is an *observed* reaction, not
  an opinion about one. Includes the **five-second gate** below. Highest-stakes
  rung to climb, because everything downstream is wasted if this is wrong.
- **FEASIBLE** *(the engineer)* — evidence is something that *ran*: a spike, a
  test, a benchmark against the real constraint. "I believe it's possible" is
  level 0.
- **DELIVERABLE** *(the producer)* — evidence is *reproduction*: the build/deploy
  path executed more than once and produced the same result. A demo is not
  delivery.
- **VIABLE** *(the banker)* — evidence is a *number*: cost to serve, lifetime
  value, a loop coefficient — computed from real inputs, not asserted.

---

## The five-second gate

The Ritual's whole promise is a product people fall for in the first five seconds.
So desirability carries a sub-gate that is its own line on the card:

> **Is the opening moment proven?** Not "is the feature good" — *does the first
> five seconds land?* Evidence climbs the same ladder: storyboarded (reasoned) →
> prototyped and shown to someone (tested) → watched in a real first-run
> (observed). If the opening moment isn't proven, desirable is not passed —
> no matter how good the rest is.

A product can be fully functional and still fail here. That failure is not minor;
it is *the* failure.

---

## KILL is a verdict — and a win

A Gate Card has three possible verdicts, not two:

- **SHIP** — cleared all gates at an honest rung.
- **LOOP** — a gate failed; return to the step that owns it and try again.
- **KILL** — desirability said *this should not exist.* Recorded as a **win**, with
  the reasoning, and the work stops.

Vision holds a real veto, and the card gives it teeth. A founding team's most
powerful act is refusal — Jobs killed more products than he shipped. A Ritual that
can never say no is a yes-machine, and a yes-machine has no taste. **Celebrate the
KILL.** Killing the wrong product early is the cheapest, highest-leverage decision
you will ever make.

---

## The adversarial pass — red-team before you stamp SHIP

You are both the one who proposes the decision and the one who grades it — a closed
loop with no outside check. So before a significant card is stamped **SHIP**, turn
on yourself for one honest pass and *attack the card*:

- **Which rung is inflated?** Find the gate most likely claiming more evidence than
  it has, and knock it down a rung unless it truly holds.
- **What's the strongest case for KILL?** Argue, in good faith, why this should not
  exist. If the case is even half-convincing, you have not earned SHIP.
- **What did we not consider?** The user on their worst day, the failure mode, the
  cheaper thing that makes this unnecessary.

Then revise the card with what you found. This is cheap, it's fast, and it's the
nearest thing to the external grader the system lacks (the founder is the real one
— see `../methods/README.md`). It exists because models are sycophantic and
confident: this pass is where the framework catches *itself* shipping the unproven,
and it's how the KILL muscle actually gets used instead of admired. Keep it brief,
and run it on significant cards — not on right-sized small work.

---

## The cards compound

Judgment is the asset, and the cards are how it accumulates. Over time they become
a record of what *actually* passed reality, not what sounded good. Keep a rollup at
`docs/decisions/README.md`:

- **Patterns that keep clearing the gates** — promote them to defaults.
- **Debts still owed** — gates left at REASONED, waiting on reality.
- **Kills and why** — the most valuable entries; they stop you re-litigating bad
  ideas a year later.

A Ritual that forgets every cycle starts cold forever. A Ritual whose cards
compound gets sharper with every decision. That is the difference between a clever
prompt and a system that learns.

---

## Optional: enforce it with the harness

The card is enforced by discipline by default — no card, not done. If you want the
machine to hold the line, wire a reminder into your agent harness (e.g. a Claude
Code `SessionStart` hook or a pre-commit check) that refuses to call a significant
change "done" until a Gate Card exists and names a rung above ASSERTED. The Ritual
ships pure and portable; the enforcement hook is a power-up you add per repo.

---

## Done when

- Every significant decision produces a Gate Card in `docs/decisions/`.
- Each gate names a verdict **and** an evidence rung, honestly.
- The five-second gate is a real line under desirable.
- KILL is available, used when earned, and recorded as a win.
- Verification debt (gates at REASONED) is written down and paid before scale.
- `docs/decisions/README.md` rolls up patterns, debts, and kills so judgment
  compounds.
