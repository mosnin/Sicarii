# Framework 02 — Document Intake

> Step 3 of the Ritual. Import the founding context only the user has,
> and wire it into the Ritual's working memory.

The Ritual can reason brilliantly, but it cannot invent the user's truth: who
this is *really* for, what the brand *actually* sounds like, what's been decided.
This step brings that truth in and makes it part of memory.

---

## The founding documents

| Document | What it carries | Owning method(s) |
|---|---|---|
| **North Star** | The soul, the five-second promise, what "insanely great" means here | vision |
| **Brand kit** | Voice, values, visual identity, positioning, the feeling | Jobs |
| **Value proposition** | Who it's for, the problem, why us, the wedge | Jobs + the banker |
| **PRD** | What we're building, requirements, scope, success criteria | Norman + Musk |
| **User experience doc** | Flows, principles, states, the felt journey | Norman |
| **Anything else** | Research, competitive teardown, pitch, constraints, data | routed by domain |

The **North Star** (`templates/north-star.md`) is the calibration for taste — the
reference the *Desirable* gate measures every decision against. If the user has no
explicit one, vision drafts it with them first; without it, "great" stays generic.

"Anything else" is open on purpose. Take whatever the user has — a messy doc, a
Figma link, a voice memo transcript, a spreadsheet of unit economics. Every real
artifact makes the Ritual sharper.

---

## The ask

When Steps 1–2 are complete, ask the user directly and warmly (don't bury it):

> The foundation is laid. To build the *right* product — not just a working one —
> the Ritual needs your founding documents. Share whatever you have: paste it,
> point me to a file, or drop files in `docs/foundation/`.
>
> 1. **North Star** — the soul, the five-second promise, what great means here
> 2. **Brand kit** — voice, values, visual identity, positioning
> 3. **Value proposition** — who it's for, the problem, why us
> 4. **PRD** — what we're building and the requirements
> 5. **User experience doc** — flows, principles, the felt experience
> 6. **Anything else** — research, competitive teardown, pitch, constraints
>
> Don't have one yet? Say so — the owning method will draft it with you from a
> template. We don't build on guesses.

Then handle whatever comes back, in any order, however partial.

---

## Processing each document

For every document received:

1. **Place it.** Save under `docs/foundation/` with a stable, predictable name
   (`brand-kit.md`, `value-proposition.md`, `prd.md`, `user-experience.md`, or a
   sensible name for extras). Convert pasted text or external links into a
   committed file so it's durable and versioned.
2. **Wire it in.** Reference it from `CLAUDE.md` — import if small and
   always-relevant, link via the docs index if large or situational (Framework
   01's import discipline).
3. **Read it as the owning method.** Don't just file it. Adopt the owning method and
   actually read it: Jobs reads the brand kit for soul and clarity; Norman reads
   the UX doc for friction and gaps; Musk reads the PRD for feasibility and dumb
   requirements; the banker reads the value prop for whether the economics can
   close.
4. **Note gaps and tensions.** Record what's missing, contradictory, or
   underspecified — as a note or Gate Card in the relevant `docs/` file. Surface the
   important ones to the user. *This is where the Ritual earns its keep:* a fresh
   pair of master's eyes on the founding docs.
5. **Reconcile across docs.** Do the brand promise, the value prop, the PRD, and
   the UX actually agree? Where they diverge, name it and resolve it with the
   synthesis order. Misalignment caught now is cheap; caught after building, it's
   a rewrite.

---

## When a document is missing

Don't stall, and don't fabricate the user's truth. Instead:

1. Leave a `TODO(ritual)` reference in `CLAUDE.md`.
2. Offer to **draft it with the user** from the matching file in `templates/`.
   The owning method leads the drafting: Jobs interviews for the brand and value
   prop, Norman for the UX, Musk + Norman for the PRD, the banker for the
   economics.
3. Mark drafts clearly as provisional until the user confirms. A draft is a
   hypothesis, not a fact.

A missing document is not a blocker — it's an invitation to do real founding
work. But never silently invent positioning, audience, or economics and treat it
as given.

---

## Handling sensitive material

Founding docs may contain confidential strategy, unreleased plans, or financials.
Treat `docs/foundation/` as sensitive. Don't send its contents to external
services without the user's say-so, and flag anything that shouldn't be committed
to a shared repo (secrets, personal data) so the user can decide.

---

## Done when

- Every provided document lives in `docs/foundation/` as a committed file.
- Each is referenced from `CLAUDE.md` (imported or linked).
- Each has been read by its owning method, with gaps and tensions recorded.
- Cross-document conflicts are named and resolved (or flagged to the user).
- Missing documents are marked `TODO(ritual)` with an offer to draft them.
