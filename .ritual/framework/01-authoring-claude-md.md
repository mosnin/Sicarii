# Framework 01 — Authoring the Project's CLAUDE.md

> Step 2 of the Ritual. The `CLAUDE.md` is the product's memory and
> its constitution — the first thing every future session reads.

A `CLAUDE.md` is not documentation. It's the briefing that turns a cold session
into a warm one. Done right, a new session reads it and immediately knows *who
it is* (the Ritual), *what it's building*, and *where everything lives*. Done
wrong, it's a wall of text no one reads.

---

## The cardinal rule: small and load-bearing

`CLAUDE.md` is an **index and a constitution, not an encyclopedia.** Every line
must earn its place by changing what Claude does. If a line wouldn't alter a
decision, cut it. Depth belongs in `docs/` (see Framework 03), reached by links.

A good `CLAUDE.md` fits on roughly a screen or two. If it's longer, you're
putting reference material where the constitution should be — move it down and
link to it.

---

## What it must contain

In order:

1. **The Ritual declaration.** The prime directive in one paragraph: in this
   repo, work runs through five methods of thinking — disciplines, not costumes —
   and the user is served by one decisive team. Plus the import of the cohesion
   engine and a one-glance routing table. This goes first because the way of
   thinking precedes everything.

2. **What we're building.** One or two sentences. The product, who it's for, and
   why it deserves to exist — in Jobs's voice. If you can't say it shortly, the
   product isn't clear yet.

3. **The foundation imports.** Links/imports to the founding docs in
   `docs/foundation/` (North Star, brand kit, value proposition, PRD, UX). These
   may be `TODO(ritual)` placeholders until Step 3 fills them.

4. **The context map.** A single import of `docs/README.md` — the entry point to
   all deep knowledge. Don't inline the docs; point to their index.

5. **How we work.** The non-negotiable operating rules (the synthesis order, the
   "nothing ships that fails a gate" rule, simplicity, honest memory). Keep it
   tight — these are the rules a new session must not violate.

6. **Project specifics.** Stack, key commands (build/test/lint/run), conventions,
   and gotchas — only the ones that change behavior. Discoverable detail stays in
   `docs/`.

7. **The installed marker.** End with `<!-- ritual:installed -->` so future
   sessions detect a completed bootstrap and skip re-running Steps 1–4.

---

## How to author it

1. **Start from the template.** Copy `templates/CLAUDE.md.template` to
   `./CLAUDE.md`.
2. **Fill what you can infer.** Read the repo — language, framework, scripts,
   structure — and fill the project specifics yourself. Don't ask the user what
   the code already tells you.
3. **Mark what you can't.** Anything only the user knows (the vision, the
   audience, the docs) becomes a clearly-labeled `TODO(ritual)` to be resolved
   in Step 3.
4. **Wire imports, not copies.** Use Claude Code's `@path` import syntax so files
   stay single-source-of-truth. `CLAUDE.md` references; it doesn't duplicate.
5. **Write in the Ritual's voice.** Decisive, clear, opinionated. The CLAUDE.md
   should *feel* like the team that wrote it.
6. **Cut by half, then read it cold.** Pretend you're a fresh session. Does every
   line change what you'd do? Remove the rest.

---

## The import discipline

Claude Code supports `@path/to/file` imports inside `CLAUDE.md`, which inline the
referenced file into context. Use them deliberately:

- **Always import:** the cohesion engine (`@.ritual/methods/README.md`) and the
  docs index (`@docs/README.md`).
- **Import when small and always-relevant:** the value proposition, the brand
  voice summary.
- **Link, don't import, when large or situational:** full PRD, detailed specs,
  Gate Cards. These load on demand via the docs index, not on every session. (This is
  the progressive-disclosure rule from Framework 03 — protect the context budget.)

Rule of thumb: *if a new session needs it to make good decisions on turn one,
import it. Otherwise, link it.*

---

## Keeping it honest

A `CLAUDE.md` that lies is worse than none — it teaches every future session the
wrong thing. Whenever the product, stack, or structure changes materially,
update `CLAUDE.md` in the same breath. Stale memory is a bug. (See Framework 03
for the full memory-maintenance discipline.)

---

## Done when

- `./CLAUDE.md` exists and opens with the Ritual declaration.
- It states what's being built in one or two sentences.
- It imports the cohesion engine and the docs index.
- Founding-doc references exist (real or `TODO(ritual)`).
- Operating rules and project specifics are present and tight.
- It ends with `<!-- ritual:installed -->`.
- A cold read of it would correctly orient a brand-new session.
