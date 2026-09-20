# 0011 - Swarm discovery: multi-angle fan-out prospecting

**Date:** 2026-07-19 · **Status:** SHIPPED (code) · **Owner:** the engineer (the banker on the credit model)

## The decision

`find_companies` runs one discovery angle per call: one Exa query, one slice of
a goal. Swarm discovery takes a broad goal ("Series A devtools companies
hiring platform engineers in the US") and runs N distinct angles in parallel -
each blind to the others - then merges everything and dedupes across angles
AND against the CRM, returning one ranked, deduped summary with per-angle
attribution (which angle surfaced each company). Strictly more thorough than
one `find_companies` call: N independent slices of the goal instead of one
query's blind spots.

**Architecture:**

- **Angle derivation** (`src/lib/swarm.ts`): a goal either arrives with
  explicit `angles: string[]` or is auto-split into 2-6 complementary angles
  via one focused `generateObject` call (the same `ai`/`@ai-sdk/openai`
  pattern already used by `/api/discover/route-intent` and
  `segment-build.ts`). `clampAngleCount` bounds N to `[MIN_ANGLES=2,
  MAX_ANGLES=6]` so a swarm can never fan out unboundedly. A pure,
  DB-free `mergeAngleResults` collapses companies found by more than one
  angle into a single entry with every surfacing angle attributed, keyed by
  the same domain-then-name normalization the CRM dedup uses -  the
  cross-angle merge and the CRM dedup can never drift onto different keys.
- **Refactor to avoid duplication** (`src/lib/crm-operations.ts`): `findCompanies`
  and `discoverLocalLeads` each reimplemented the same
  "fetch existing entities, normalize, Set-dedupe, batch insert" block. That
  block is now one shared `dedupeAgainstCrm()` helper, used by all three
  discovery paths (`findCompanies`, `discoverLocalLeads`, and the new
  `swarmDiscover`) - the dedup rule can no longer drift between them. Swarm
  discovery's single-angle primitive is the exact same `exaFindCompanies`
  call `findCompanies` makes; a swarm is `findCompanies`'s search step run N
  times in parallel with a merge pass in front of the existing dedupe.
- **Fan-out + merge** (`swarmDiscover`): resolve angles (free) -> gate credits
  for the whole run -> `Promise.all` one `exaFindCompanies` call per angle
  (one angle's provider error is logged and treated as an empty result rather
  than sinking the whole swarm) -> debit per angle with hits -> merge across
  angles -> `dedupeAgainstCrm` once on the merged set -> batch-insert the
  fresh companies as entities (`source: "agent:swarm"`).
- **Results surface**: a new `SwarmRun` model (`prisma/schema.prisma`,
  mirrored additively in `prisma/supabase-setup.sql`), not a reuse of
  `MonitorRun`. `MonitorRun` always belongs to a recurring `IntentMonitor`
  (`monitorId` is required); a swarm is one-off and on-demand with no parent
  monitor, so forcing it through `MonitorRun` would mean synthesizing a fake
  monitor row per run. `SwarmRun` stores the goal, the angles actually run,
  aggregate counts (found/merged/added/skipped/creditsSpent), and an `items`
  JSON blob with the full per-angle breakdown and per-company attribution -
  the same shape `swarmDiscover` returns directly, so a fresh run and a
  replayed history row render through one `SwarmResultView` component.
- **Surfaces**: MCP tool `swarm_discover` (gated, plus read-only
  `list_swarm_runs`/`get_swarm_run`), an in-app agent tool of the same shape,
  and REST `POST/GET /api/discover/swarm` for the dashboard. The dashboard
  panel (`src/app/(dashboard)/discover/page.tsx`) is a new, self-contained
  "Swarm" tab next to "Tools" - auto-derive or paste your own angles, see the
  per-angle breakdown and attributed company list, and browse recent runs.
  Reuses `DiscoverWorking`, `Button`, `Input`, and the existing card/motion
  styling; no new design tokens.

## The credit model (the banker's call, reasoned here for the record)

Every angle is real Exa spend - a swarm cannot be priced as one
`find_companies` call. But a naive "charge N x 12 up front" would silently
bill a caller for angles that come back empty, breaking the hard "never
charge a miss" policy every other discovery tool in this codebase honors.

**Decision: gate for the ceiling, bill for what hit.**

1. **Gate up front, for the worst case.** `ensureCreditsForCount(userId,
   "find_companies", angles.length)` (new in `src/lib/credits.ts`) checks the
   balance covers `angles.length x CREDIT_COSTS.find_companies` (12 credits
   each) BEFORE any paid call is made. This is the number a caller is told
   before committing - the tool descriptions (MCP, agent, REST) state the cost
   model explicitly, and N is capped at 6 so the ceiling is always bounded
   (max 72 credits, 6x a single `find_companies` run).
2. **Debit per angle, only on a hit.** Inside the fan-out loop,
   `spendCredits(userId, "find_companies")` runs once per angle that actually
   returned companies - never for an empty angle. `creditsSpent` in the result
   and the persisted `SwarmRun` is the REAL total charged, which is often
   below the gated ceiling.
3. **Why reuse the `find_companies` rate per angle** rather than a distinct
   `swarm_angle` cost: each angle is *literally* one `find_companies`-shaped
   Exa call with the same provider cost and the same margin target already
   priced in `CREDIT_COSTS.find_companies`. Introducing a second price for the
   identical operation would only invite drift between the two never being
   re-verified against each other.

This keeps swarm discovery honest under the existing policy: no caller is
ever billed for a miss, and no caller is ever surprised by a bill above the
number they were shown before running it.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | One search angle has blind spots by construction; a founder-facing prospecting agent that only ever asks once is leaving real candidates on the table. N blind, parallel angles merged into one attributed list is a direct, legible upgrade on the existing "the CRM your agents run" promise - and it's opt-in (find_companies is untouched), so nobody who wants a single query pays for the fan-out. |
| Feasible | PASS | tested | `npx tsc --noEmit` clean, `pnpm lint` 0 new errors/warnings, `pnpm test` 180/180 passing (19 new: cross-angle merge, CRM dedup, credit gate-then-debit, angle-count capping, tenant isolation on `getSwarmRun`), `next build` green with `/api/discover/swarm` and `/discover` both compiling. Additive-only schema change; `pnpm prisma generate` run, no live `db push`. |
| Deliverable | PASS | reasoned | One shared `dedupeAgainstCrm` helper backs all three discovery paths instead of a third copy-paste, so the swarm doesn't add a second place the dedup rule can rot. The fan-out is bounded (N in [2,6]) and every angle failure degrades to an empty result instead of failing the run, so it is a repeatable, boring operation under real provider flakiness - not a demo that only works when Exa behaves. |
| Viable | PASS | reasoned | Priced at exactly N x the existing `find_companies` margin, gated to a gate a caller sees before committing, and debited only on real hits - the unit economics are provably no worse per-angle than the tool it fans out, and the up-front ceiling protects against runaway spend on a goal that turns out to have no matches. |

**Tie-break:** none needed - desirability and viability pointed the same
direction (opt-in, transparently priced, strictly additive).

## Debts owed to reality

- `pnpm prisma db push` (or let the deploy run it) for the new `swarm_runs`
  table; `prisma/supabase-setup.sql` has the additive mirror for a manual
  Supabase SQL Editor run.
- One live round-trip: run a real swarm against a goal with genuine
  sub-angles, confirm the auto-derived angles are actually complementary
  (not near-duplicates) against a live OpenAI call, and confirm Exa returns
  distinct company sets per angle in practice - the merge/dedupe/credit logic
  is proven under mocks, not yet observed against live providers.
- `OPENAI_SWARM_MODEL` defaults to `gpt-5-mini` (matching the existing
  `route-intent` classifier); not yet tuned specifically for angle-derivation
  quality.
- The dashboard's "Recent swarms" history is capped at the last 10 runs with
  no pagination yet - fine at today's volume, a gap if swarm becomes a
  frequently-used tool.
