# 0013 - Self-optimizing outreach: a bandit over subject/opener variants

**Date:** 2026-07-19 · **Status:** SHIPPED (code) · **Owner:** the engineer (the human on the read-only surface)

## The decision

The agent silently learns which outreach openers/subject lines get replies,
per segment, and converges on the best ones without a human ever configuring
an A/B test. A multi-armed bandit over message variants, attributed by reply
rate, built end to end: schema, ops, MCP tools, in-app agent tools, REST, a
read-only stats UI, and tests.

- **Schema (additive only):** `OutreachVariant` (userId, optional segmentId,
  kind `SUBJECT | OPENER`, text, sends, replies, active, timestamps) and
  `VariantSend` (variantId, contactId, sentAt, replied, repliedAt) - a join,
  not a `variantId` column on `Activity`. Chosen because `Activity` is a
  polymorphic, multi-kind log (note/call/outreach/reply/status_change) shared
  by contacts and entities; bolting attribution onto it would mean filtering
  that general log by kind/channel to find "the most recent unreplied send to
  this contact," with no natural place to flip a "replied" flag on a past row
  without also touching its human-facing meaning. The join keeps attribution
  a single indexed query (`contactId, replied, sentAt`) with an obvious,
  race-safe terminal state. Mirrored to `prisma/supabase-setup.sql`.
- **Selection (`src/lib/variant-bandit.ts` + `variant-operations.ts`):**
  Thompson sampling, not epsilon-greedy or "pick highest mean." Each variant's
  posterior is `Beta(replies + 1, sends - replies + 1)` (Beta(1,1) uniform
  prior); `selectVariant` draws one sample per active variant in the
  (segment, kind) pool and returns the highest draw. This is self-balancing:
  wide posteriors early scatter draws near-uniformly (free exploration);
  posteriors concentrate as sends accumulate so a genuinely better variant
  wins more often (free exploitation), with no epsilon knob and no hard
  cutover. The Beta samples come from real Gamma variates (Marsaglia-Tsang
  rejection sampling + Box-Muller normals), not a shortcut approximation. The
  RNG is injected (`Rng` type, defaults to `Math.random`) so the algorithm is
  a pure, deterministic function under a seeded generator in tests.
- **Attribution:** `logOutreach` and `saveSocialMessage` accept an optional
  `variantId`; when present they record a `VariantSend` and increment
  `sends` inside the existing array-form `$transaction`. `saveSocialMessage`
  is the one place an INBOUND message advances a contact CONTACTED -> REPLIED
  (the only reply-detection path in the codebase today); on that exact
  transition it calls `attributeReply(contactId)`, a single atomic
  `UPDATE ... WHERE id = (SELECT ... ORDER BY sentAt DESC LIMIT 1)` that
  claims the most-recent unreplied send and increments that variant's
  `replies` - the same "conditional atomic update, zero rows means already
  handled" shape as `spendCredits`' balance-guarded decrement, so two
  concurrent replies can never double-count.
- **Integration:** both variantId fields are optional and additive; every
  existing `logOutreach`/`saveSocialMessage` call site is unchanged.
  `OpError` moved to `src/lib/op-error.ts` (crm-operations.ts re-exports it)
  so `variant-operations.ts` can depend on it without a
  crm-operations <-> variant-operations import cycle - every existing
  `import { OpError } from "@/lib/crm-operations"` call site is unaffected.
- **MCP tools:** `create_variant` (gated, write), `select_variant` and
  `list_variant_stats` (`run()`, free CRM reads/compute, no credit gate per
  the "CRM reads/writes are free" policy). `log_outreach` and
  `log_social_message` gained optional `variantId`. Server instructions
  updated with the select-then-log loop.
- **In-app agent:** `select_variant` + `list_variant_stats` added, and
  `variantId` added to its existing `log_social_message` tool (the in-app
  agent has no `log_outreach` tool today, so this is the only place it can
  record a send) - without this the in-app agent's `select_variant` would be
  functionally dead, since nothing would ever record a send against its pick.
  The in-app agent does NOT get `create_variant` (per spec); it can only use
  variants an MCP-connected agent (or future tooling) has already created.
- **UI:** `GET /api/variants` (read-only, `listVariantStats`) + a card on
  `/field`'s Segments tab (`VariantStatsPanel`) showing sends/replies/reply
  rate and a "Winning" tag per variant, grouped by segment. Deliberately no
  create/edit UI - the bandit runs itself; the human observes.
- **Tests (37 new, 198 total, all passing):** `variant-bandit.test.ts` (pure
  math: cold-start near-uniform exploration, exploitation dominance once a
  winner is clear, an unlucky-early arm keeps a real shot, determinism under
  a seeded RNG); `variant-operations.test.ts` (tenant isolation on every op,
  selection scoping, attribution atomicity and SQL parameterization, stats
  grouping/winner calc); `variant-attribution.test.ts` (the crm-operations.ts
  integration wiring, including backward-compat: `logOutreach` and
  `saveSocialMessage` behave identically with no `variantId`).

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Matches the product's own thesis (quiet leverage, agent-run CRM): outreach that improves itself without the human configuring anything is a direct instance of "it's already working for me." |
| Feasible | PASS | tested | tsc, eslint (0 new errors), vitest (198/198, incl. 37 new), and `next build` all green. The bandit math is a real Thompson-sampling implementation (Gamma/Beta sampling), not a mean-comparison shortcut, verified by distribution assertions under a seeded RNG. |
| Deliverable | PASS | reasoned | One additive migration path (schema + supabase-setup.sql mirror, `prisma generate` run, no `db push`); every integration point is optional/backward-compatible; ownership checks and rate limits follow the exact existing MCP/ops conventions. |
| Viable | PASS | reasoned | Zero marginal cost: variant selection and attribution are pure CRM bookkeeping (no external provider call), so per the existing credit policy this is unmetered - it makes outreach the agent already sends more effective at no additional cost to the user. |

**Tie-break:** none needed - all four gates passed on the first pass with no
competing direction to choose between.

## Debts owed to reality

- **No live reply-detection round-trip yet.** The only place an INBOUND
  message flips a contact to REPLIED in this codebase is `saveSocialMessage`
  (social DMs/comments). There is no email-inbound-reply webhook, so a
  variant used via `log_outreach` for an EMAIL touch can record a `sends`
  count but will never see its `replies` incremented unless the agent also
  logs the inbound email reply as a `saveSocialMessage`-style event or a
  future email-reply detector is wired to call `attributeReply`. This is a
  real, named gap, not silently swept under "additive" - email is likely the
  primary outreach channel, so this materially limits the bandit's coverage
  until email reply detection exists.
- **`prisma/supabase-setup.sql` was already stale before this change** (it is
  missing `segments`, `pipelines`, `activities`, `credit_ledger`, and several
  other tables that exist in `schema.prisma`) - a pre-existing debt, not
  introduced here. The new `outreach_variants`/`variant_sends` DDL and its FK
  to `segments` were still added in the correct place and style; running this
  file alone against a fresh database will fail on the `segments` FK exactly
  as it already would for `contactSegment`/`pipelineEntry` today. Backfilling
  the whole file is out of scope for this cycle.
- **No live production round-trip observed.** Everything above is
  tested-in-build (mocked Prisma, seeded RNG, `next build`); the founder still
  owes a real `pnpm prisma db push` (or Supabase SQL run) plus one live
  MCP round-trip: create a variant, have an agent select and log outreach with
  it, log an inbound reply, and confirm `list_variant_stats` shows the reply
  rate and winner update.
- **In-app agent cannot create variants.** Per the brief's exact tool split
  (`select_variant` + `list_variant_stats` only), a workspace whose only agent
  surface is the in-app chat (no MCP-connected agent) can never seed a
  variant pool, so `select_variant` there will always 404 with "call
  create_variant first" until an MCP agent (or a future in-app
  `create_variant` tool) creates one. Named here rather than silently
  shipped as if the in-app agent were fully self-sufficient.
