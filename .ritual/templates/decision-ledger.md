# Decision Ledger — the ratchet

> Lives at `docs/decisions/README.md`. This is the product's **retained memory** —
> the thing the SessionStart hook re-injects every session so gains compound
> instead of leaking (see `framework/07-the-ratchet.md`). Keep it tight and
> current: it is read in full at the start of every session, so every line must
> earn its place. The individual Gate Cards are the history; this is the *living
> summary* of what that history means.

The rule: **build on the patterns, pay the open debts, never re-open a kill or a
falsified claim.** Re-litigating settled decisions is exactly the leak that turns
exponential growth into a plateau.

> The *current aim* — what to work on next — lives in a separate, more volatile
> file, `docs/decisions/heading.md` (`templates/heading.md`,
> `framework/09-the-heading.md`). This ledger is the *accumulated* memory; the
> Heading is *where the vector points right now*. The Ratchet surfaces the Heading
> first, then this ledger.

---

## Patterns that keep passing (promote to defaults)

> Moves that have cleared the gates more than once. These are now the house
> style — reach for them first; don't re-derive them.

- *(e.g. "Sharing is an access-control primitive, not a link feature" — Gate Card 0003)*

## Open debts (owed to reality)

> Gates currently standing at REASONED, waiting on evidence. Each names the proof
> that would discharge it and who owes it. Pay these down before scaling.

| Debt | Gate / Card | Evidence owed | Owner |
|------|-------------|---------------|-------|
| *(e.g. delivery path reproduces)* | *Card 0003 · Deliverable* | *build it for a 2nd object type* | *founder/eng* |

## Kills & falsifieds (do not re-open)

> Ideas killed by the Ritual (shouldn't exist) or falsified by the Altar (reality
> won). Recorded with *why*, so they are never re-litigated a year later.

| What | Verdict | Why (one line) | Card |
|------|---------|----------------|------|
| *(e.g. "five separate sharing flows")* | KILLED | one primitive beat five one-offs | 0003 |

---

<!-- The hook reads this file verbatim each session. Prune ruthlessly: a stale
     ledger teaches every future session the wrong thing. -->
