# 0006 - The Four Moments (from reliable to exceptional)

**Status:** PLANNED · stamped 2026-06-09 · owner: Vision (the human advising)
**Verdict trail:** product audited at 6/10 - correct, honest, billable, unfelt
(`docs/engineering/claims-audit-2026-06-09b.md`). The gap to 9 is not features.
It is four *moments* the product does not have. This card is the plan to build
them, in order, each gated by the founder feeling it.

## The principle this cycle obeys

Stop adding capability. Start choreographing. Every phase below ships the
smallest whole that can be *felt in five seconds*, and nothing ships on a vibe:
each moment has a falsifier, and a moment that fails its falsifier gets cut
down, not shipped flat. No new surfaces, no new providers, no new tools
anywhere in this cycle.

## Gate verdicts (synthesis order)

- **Desirable:** PASS (reasoned). All four moments serve the North Star
  directly - "quiet leverage: it's already working for me." The first run and
  the pulse ARE that sentence rendered as software.
- **Feasible:** PASS (reasoned). Every moment composes existing, audited
  plumbing: findCompanies/enrich ops, CreditLedger (doubles as the activity
  trail), source tags, ApiKey.lastUsedAt, productContext, the polling hook that
  was built and never used. No new infrastructure.
- **Deliverable:** PASS (reasoned). Two waves of parallel agent builds on
  isolated worktrees (the #28 pattern), disjoint file sets, integrated and
  verified as a whole.
- **Viable:** PASS (reasoned) with one founder call: the first-run performance
  costs ~102 credits of provider spend per signup if metered. Recommendation:
  the demo is free (unmetered, hard-capped) - it is marketing, not usage.

**Debts owed to reality (cannot be closed in code):** providers funded;
one observed end-to-end run; OAuth handshake exercised against a real client;
Creem products created. These are Phase 0 and the founder's.

---

## Phase 0 - The Reality Gate (founder, ~1 hour, BLOCKS EVERYTHING)

1. Fund Explorium; confirm Pipe0 credits. Set `UPSTASH_REDIS_REST_URL/TOKEN`.
   Run the pgvector index (supabase-setup.sql step 4).
2. Run, live, watching: discover "nail salons in Miami" -> enrich one -> news.
3. Record the verdict in the heading: did it feel like quiet leverage?

**Falsifier:** if the loop works but feels flat, STOP - fix the loop before
choreographing it. Chrome on a flat loop is the one unforgivable spend.
**Why it blocks:** Moments 1-4 all *perform* this loop in front of users. A
choreographed failure is worse than no choreography.

## Phase 1 - Moment 1: The First Run ("the performance")

**The felt experience:** sign up -> one question - *"What do you sell, and to
whom?"* -> and live, in front of you, your CRM builds itself: ~10 companies
appear, 3 enrich themselves, an in-market signal surfaces. Sixty seconds, zero
clicks after the sentence. End card: "Your CRM is already working." CTAs:
see it (dashboard) / connect your agent (Moment 4).

**Design decisions:**
- The sentence saves to `User.productContext` - the onboarding answer IS the
  grounding the agent uses forever. One sentence, two jobs.
- Routing: a `/welcome` page in the (dashboard) group; dashboard redirects to
  it when the user has 0 entities and no productContext. Skippable (a quiet
  "skip" link), never shown twice.
- Mechanics: one orchestrator route reusing the shared ops (findCompanies ->
  pick 3 with domains -> enrichEntity each -> one intent search), with rows
  materializing via polling (the existing unused use-polling hook). The
  existing AsciiField/thinking aesthetics carry the stage; no new design
  language.
- Metering: unmetered behind an internal flag, hard-capped server-side
  (10 finds / 3 enrichments / 1 signal, once per user ever).
- Failure choreography: per-step timeouts already exist; a failed step renders
  the honest blank ("couldn't verify live right now - your agent will retry"),
  and the show goes on. Never a hung spinner.

**Falsifier (founder watches a fresh signup):** if rows appearing unprompted
does not produce the spark, or providers stutter past one retry, cut the show
to discovery-only (companies appearing, no live enrich) rather than ship a
stuttering performance.

## Phase 2 - Moment 2: The Pulse ("while you were away")

**The felt experience:** open the dashboard after time away and the first thing
you read is *"While you were away, your agent added 14 companies, enriched 9,
flagged 2 as in-market."* with the single best record shown. Quiet typography.
No confetti. Leverage, stated.

**Design decisions:**
- Additive schema: `User.lastSeenAt`, stamped on dashboard load.
- The delta is computed from what already exists: entities/contacts
  `createdAt` + `source` (agent-created rows), CreditLedger actions (the audit
  trail doubles as the activity feed), MonitorRun added counts.
- Renders in the dashboard hero band when delta > 0; otherwise the normal
  greeting. One compact activity list in an existing card - NOT a new surface.
- "Best one": most recently enriched record with a signal, else newest enriched.

**Falsifier:** if the pulse reads as noise (users with zero agent activity see
nothing different), it has failed - it must never show an empty brag.

## Phase 3 - Moment 3: Visible Trust (provenance + the honest blank)

**The felt experience:** every enriched field says where it came from -
*"Verified against acme.com · Pipe0 · Jun 9"* - and every miss says, in the
product's own voice: *"No verified phone - Scalar doesn't guess."* The accuracy
rule stops being a code comment and becomes the visible brand.

**Design decisions:**
- Persist what we already compute and throw away: contact-enrich knows `via`
  per field; store `{ field: { via, verifiedAgainst, at } }` under a
  `_provenance` key in the existing enrichment Json (no schema change), same
  for entity aspects. Misses persist `{ field: { missAt } }` so the honest
  blank survives reload.
- UI: one small muted line under enriched fields on contact + entity pages;
  the honest-blank line where a Find returned nothing. No icons, no badges.

**Falsifier:** if provenance clutters the record pages (the human's read:
does the page still feel calm?), collapse it behind hover/tap - the principle
must be visible without shouting.

## Phase 4 - Moment 4: The Handshake (connect, with a heartbeat)

**The felt experience:** a `/connect` page: pick your agent (Claude, Claude
Code, Cursor, OpenClaw, Hermes, any MCP), get exactly one copy-block, and then
the page *listens*: "Waiting for your agent..." until the first authenticated
call lands - then it flips: **"Connected. First write received:"** with the
actual record. The green dot is the unboxing.

**Design decisions:**
- Detection from what exists: ApiKey.lastUsedAt (stamped on MCP auth) and
  agent-sourced rows since page-open, polled.
- API-key creation inline (reuses /api/keys); OAuth clients just get the
  connector URL. Linked from onboarding's end card, the dashboard, and
  Settings. Launchpad entry; NOT in the dock (it is a one-time flow).
- **Altar item:** the founder connects Claude's custom connector for real -
  the OAuth flow gets its first live observation here, closing that owed debt.

**Falsifier:** if first-call detection is unreliable (lastUsedAt is
best-effort), degrade honestly to "key created - run any tool call and check
your CRM" rather than a green dot that lies.

## Phase 5 - The gate out

- Founder runs the five-second test on all four moments in sequence as one
  journey: signup -> performance -> connect -> away -> pulse -> record page.
- Subtraction holds: Radar/Field/Map/Skills stay demoted. Zero new surfaces
  shipped this cycle.
- RECORD: update this card to SHIPPED or note what was cut; refresh heading +
  ledger; claims-audit addendum if any public claim changed.

## Execution shape

- **Wave A (parallel agent builds):** Moment 1 + Moment 2 (disjoint: /welcome
  + orchestrator route vs dashboard band + lastSeenAt).
- **Wave B (parallel):** Moment 3 + Moment 4 (enrich-lib provenance vs new
  /connect page).
- Each wave: worktree isolation, tsc/eslint/build/tests green per agent,
  integrated and re-verified as a whole, one PR per wave (the #28 pattern).
- Founder gates between waves are observation, not code review.

## Founder calls surfaced (answer before Wave A)

1. **The demo is free?** Recommended yes: first-run performance unmetered,
   hard-capped, once ever. (Alternative: metered against the free 200, which
   burns half the allotment on the show.)
2. **Phase 0 first?** The plan assumes you run the Reality Gate before Wave A
   ships to users. Wave A can be BUILT in parallel with Phase 0, but not
   merged to main until the loop is observed.
