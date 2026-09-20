# 0010 - Budgeted autopilot: propose a spend plan, approve once, run within the cap

**Date:** 2026-07-19 · **Status:** SHIPPED (code) · **Owner:** the engineer (the banker on budgets, the human on the approve gate)

## The problem

Today an agent working unsupervised hits a surprise HTTP 402 mid-task the
moment credits run out - a hard stop with no warning, no plan, and no clean
story for the human who comes back to find work half-done. Budgeted Autopilot
lets an agent commit to a budget up front instead: propose a spend ceiling
split across categories, get a human's approval once, then run unsupervised on
a schedule, hard-stopping cleanly at the cap instead of erroring.

## The decision

- **Schema: `AutopilotPlan` + `AutopilotAllocation` + `AutopilotRun`.**
  Allocations are a **child table**, not a JSON blob, deliberately: the budget
  guard needs a single atomic, conditional SQL UPDATE per charge (`spent =
  spent + amount WHERE spent + amount <= allocated`), the exact proven pattern
  `spendCredits` already uses for the credit meter's own atomic decrement.
  Hand-rolling that arithmetic inside a JSONB column would mean bespoke
  `jsonb_set` math with none of Prisma's type safety, and the dashboard's
  per-category bars would need to unpack JSON on every render instead of
  reading indexed columns. A JSON blob wins on schema simplicity; a child table
  wins on correctness and directness for the one operation that matters most
  here (atomic conditional increment) - correctness won. `AutopilotRun` is an
  append-only ledger (one row per autonomous action) so "what did my autopilot
  do this week" is a straight query, not a derived reconstruction. Additive
  only; mirrored into `prisma/supabase-setup.sql`.
- **The budget guard (`src/lib/autopilot-operations.ts`, `runAutopilotStep`)
  is an ADDITIONAL ceiling layered on top of the real credit meter, not a
  replacement for it.** The underlying ops (`findCompanies`, `enrichEntity`,
  ...) call `ensureCredits`/`spendCredits` against the real `User.creditsRemaining`
  completely unchanged. The guard: (1) peeks the category's remaining room and
  hard-stops the PLAN - never throws a raw 402 - when the peek shows the
  action wouldn't fit; (2) calls the real op; (3) measures the amount ACTUALLY
  spent by diffing the user's real balance before/after (never assumes the
  nominal cost was charged - an idempotent enrich, a dry search, and a genuine
  miss all spend 0); (4) atomically charges the plan's category allocation
  with that observed amount via the conditional UPDATE. Because every metered
  action costs a fixed amount (`CREDIT_COSTS[action]` is a constant) and the
  peek already confirmed that fixed amount fits, the charge succeeds by
  construction in the normal case - the only way it can fail is a genuine
  concurrent tick racing the same plan, in which case the real spend (already
  irreversible) is still recorded honestly and the plan is hard-stopped
  immediately, never silently dropped and never allowed to keep spending.
- **Two hard-stop outcomes, distinguished on purpose:** `paused` when one
  category hits its cap but others may still have room; `exhausted` when the
  whole window's approved budget is spent. Both stop the scheduler from doing
  further autonomous work on that plan until a human re-approves it (which
  resets spend and opens a fresh window).
- **Approval is human-only, enforced at the transport layer, not by
  convention.** The REST route (`/api/autopilot-plans/[id]/approve`) resolves
  the caller exclusively via `getAuthenticatedUser()`, which reads only the
  Clerk session cookie (`auth()`) - it has no `Authorization: Bearer`
  fallback, so a connected agent holding an API key can never reach it. There
  is no MCP tool and no in-app-agent tool for approval at all; an agent can
  `propose_autopilot_plan` (always born `draft`) and `pause_autopilot`, never
  approve. `tests/autopilot-approval-gating.test.ts` pins this by inspecting
  the actual route/tool source, the same technique `tests/credits.test.ts`
  uses for the "never charge before the agent knows which tools ran" policy.
- **The execution loop (`src/lib/autopilot-run.ts`) reuses existing ops only** -
  `findCompanies` for discovery, `enrichEntity` for enrichment,
  `listDueFollowups` for outreach (surfaced via the existing task-webhook
  mechanism so the human's own agent acts on it - Scalar has no autonomous
  send capability to reuse, and building one was explicitly out of scope).
  Scheduled on the same Inngest cron mechanism `IntentMonitor`/
  `ResearchSchedule` already use (`src/inngest/functions.ts`), not a new
  scheduler.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Directly named in the brief: surprise 402s mid-task are a real gap in "the CRM your agents run." A budget approved once, then honored automatically, is the felt win - the human trusts the agent with a number instead of supervising every call. |
| Feasible | PASS | tested | tsc, eslint, `next build`, and 187 vitest tests (up from 155) all green, including a dedicated atomicity suite (`tests/autopilot-budget.test.ts`) that exercises the real conditional-UPDATE semantics via a simulated row and proves the never-exceed invariant across repeated concurrent-shaped charges. |
| Deliverable | PASS | reasoned | One PR; additive-only schema (3 tables, 2 enums); no backfill; the execution loop composes existing ops rather than adding new discovery/enrichment surface. Owed: a live `pnpm prisma db push` + one real Inngest cron cycle observed against a live Supabase database (not run here per the task's DB-connection constraint). |
| Viable | PASS | reasoned | Zero new credit cost of its own - the plan is a ceiling, not a source of spend; it only shapes WHEN existing metered actions run, so it cannot create margin risk. It makes the existing metered surface (find_companies, enrich_entity) more attractive to leave running unsupervised, which is a usage/retention lever, not a cost center. |

**Tie-break:** none needed; no gate conflicted.

## Debts owed to reality (named, not hidden)

- **Concurrent-tick races are handled but not eliminated.** The atomic
  conditional UPDATE guarantees the allocation's `spent` column can never
  exceed `allocated` (proven in tests), and the before/after credit-delta
  measurement guarantees a real spend is never silently dropped. But two
  genuinely concurrent ticks for the SAME plan (which the Inngest cron does
  not currently prevent with a concurrency key) could each independently pass
  the pre-flight peek before either charges, in which case the second charge
  is recorded honestly past the nominal peek and the plan is immediately
  hard-stopped. In practice one hourly cron sweep processes plans
  sequentially, so this is a narrow window, not the common path - closing it
  fully (an Inngest `concurrency` key per plan id) is a one-line follow-up,
  named here rather than silently assumed away.
- **The real-credit-delta measurement can double-count unrelated concurrent
  spend by the same user.** `runAutopilotStep` reads `creditsRemaining`
  before and after calling the real op; if the user's OWN separate activity
  (e.g. a manual dashboard action) spends credits during that same window, the
  plan could attribute that spend to itself. This only makes the plan look
  MORE spent than it truly is for its own actions (it can never cause the
  plan to under-report and thus never causes it to exceed its allocation) -
  a conservative failure mode, not a safety gap, but worth naming.
- **Each tick does a bounded chunk of work, not "spend the whole window's
  budget every cycle."** Discovery is capped at 3 calls/tick, enrichment at 5
  entities/tick, outreach at 10 flagged contacts/tick (`src/lib/
  autopilot-run.ts`). A generous weekly allocation may go partly unused if the
  bounded loop finishes before the budget does. This trades full budget
  utilization for a predictable, bounded blast radius per scheduler
  invocation - a deliberate v1 simplification; raising the caps is a one-line
  change once real usage shows it's warranted.
- **Real credit exhaustion (unrelated to the plan's own cap) does not itself
  pause the plan.** If the user's actual `creditsRemaining` runs out for
  reasons outside this plan, the underlying op throws its normal 402, the
  step is skipped cleanly (`runAutopilotStep` catches the `OpError` and
  returns `ran:false` without hard-stopping the plan), and the plan stays
  `active` - it will just keep quietly doing nothing until real credits
  refill. This is intentional: the plan's `paused`/`exhausted` status is
  reserved for its OWN approved ceiling being spent, not for the account's
  broader billing state (which is already visible on the Settings page).
- **`pnpm prisma db push` for the three new tables** (or let the deploy do
  it), same as every prior schema cycle.
- One live round-trip is owed: propose a plan via the in-app agent, approve it
  from `/autopilot`, observe an Inngest cron tick actually run discovery and
  charge the allocation, and confirm the webhook fires. This stands at
  TESTED-in-build + unit-tested-guard only, not yet OBSERVED in a live
  environment.
