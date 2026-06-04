# The Ritual, performed — a worked example

> Don't trust the framework because the README says it works. Watch it work — the
> whole arc, **Ritual → Altar → Magic**, with the seams showing so you can see the
> methods *change the decision*, the evidence get *grounded*, and the gains get
> *retained*.

**The brief:** *"Add a way for users to share their work."*

---

## Without the framework

> Add a **Share** button. Generate a public URL. Copy it. Toast: "Link copied."
> Ship.

It works. It's also forgettable, slightly scary, and does nothing for the
business. A *feature.* Now the framework turns the same brief into a *product.*

---

## ① THE RITUAL — dream it

**Frame *(vision + the human)*.** Vision rejects the cliché ("Share" is not a
button) and reframes: *the moment someone is proud enough to put their name on
their work in front of someone else.* The human names the real goal: *let someone
see my work without me feeling exposed.*

**Design — diverge, then cut.** Kill the first idea (a raw public link). Put up
real options (public link / named-people / expiring / workspace) and cut to **one
primitive: share with a person, at a permission level.** The smallest *whole*
thing: a sheet that says *"Maya can view this"* and means it. Sweat the five
seconds: the recipient opens *to the work*, with the sharer's name.

**Run the gates → stamp a Gate Card.** Each gate names its evidence rung
(asserted → reasoned → tested → observed); nothing passes on a vibe:

> **Gate Card 0001 — Sharing is an access-control primitive, not a link feature**
> Date: 2026-06-03 · Verdict: **SHIP → to the Altar** · Led by: vision
>
> | Gate | Verdict | Rung | Evidence |
> |---|---|---|---|
> | **Desirable** | PASS | REASONED | "proud + safe handoff" is a sharp non-cliché wedge — *not yet shown to a real user* |
> | ↳ 5-second gate | PASS | REASONED | share-sheet storyboarded; not yet watched in a real first-run |
> | **Feasible** | PASS | REASONED | one auth primitive (subject→resource→capability) should make link/embed/export thin views — *unproven* |
> | **Deliverable** | PASS | REASONED | one path for every object, in principle — not reproduced |
> | **Viable** | PASS | REASONED | each share is a warm invite → growth loop; sharing free, depth paid |
>
> **Tension:** producer wanted five flows; vision cut to one. **Tie-break:** converged.
> **Verdict:** SHIP. Every gate is REASONED → **heavy debt owed to reality.**
> **🛎️ Founder Call:** taste confirmed against the North Star? (proud+safe = yes)

Honest: on a cold build *nothing is OBSERVED yet* — and the card says so rather
than faking a rung. The debts are now the backlog.

## ② THE ALTAR — ground it

The Heading says work the **binding constraint**: *does one auth primitive really
collapse link/embed/export into thin views?* (the cheapest claim that could
falsify the whole design). The Altar builds the **smallest proof** — not the
product:

> **Proof 0001 — one primitive covers every share surface**
> Built a spike: the authorization primitive + link, embed, and export
> implemented as views over it, for **two** object types. Both reproduced
> identically. **Feasible REASONED → TESTED. Deliverable REASONED → TESTED.**
> *Owed to reality:* prod-scale audit + pen-test before OBSERVED.

If the spike had shown the surfaces needed bespoke logic → **FALSIFIED**, back to
the Ritual. It didn't; the card climbs. *Truth broke ties here, not taste.*

## ③ THE MAGIC — make it real

Ship the smallest whole share experience; the **founder** puts it in front of 5
real people and watches the first five seconds.

> **Verdict: 🛎️ owed to reality (Founder Call).** Desirable + the 5-second spark
> can only be **OBSERVED** by the founder with real users — the model will not
> invent it. *If* 4/5 reach "this is mine, and it's safe" unaided → **MAGIC**. If
> it works but no one's moved → **FLAT** (back to ① for taste). If they love it
> but it can't scale → **MIRAGE** (back to ② for truth).

## The Heading + the Ratchet — retain and re-aim

RECORD writes the cycle into the ledger and re-points the Heading:

```
docs/decisions/heading.md  →  next: founder runs the 5-real-user first-run test
docs/decisions/README.md   →  pattern: "make the invitation the growth loop"
                              kill:    "five bespoke sharing flows"
                              debt:    desirable/5-sec OBSERVED (owed to founder)
```

Next session, the **Ratchet hook re-injects all of this first** — so the gains
never leak and the work never gets re-litigated. That's φ→1: the difference
between a plateau and compounding.

---

## The gap

| | Without | With the framework |
|---|---|---|
| **What ships** | a Share button + public link | a proud, safe sharing *experience* |
| **Security** | a new public-link code path | one audited auth primitive (proven on 2 types) |
| **Future features** | each sharing case re-built | inherit sharing for free |
| **Business** | neutral | the product's growth loop |
| **Evidence** | "looks done" | rungs named; debts owed to reality, not faked |
| **Next time** | starts cold | the Ratchet re-injects what was learned |
| **In a word** | feature | product |

Same brief. Five disciplines each changed the decision; the Altar grounded it; the
founder owns the spark; the Ratchet keeps it. **That's the framework — not a
costume, a way of reaching the better answer and never giving it back.**
