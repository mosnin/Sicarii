# 0012 - Stalled-deal breakup drafts: Scalar notices, drafts, never sends

**Date:** 2026-07-19 · **Status:** SHIPPED (code) · **Owner:** the engineer (the human on the review-queue UX)

## The decision

When a deal goes cold, the highest-response move is a "breakup" email: a
polite pattern-interrupt ("I'll assume the timing isn't right and close this
out - let me know if that's wrong"). Scalar now notices cold deals itself,
drafts the breakup grounded in the real relationship history, and holds it for
one-click human approval. It never auto-sends.

- **Cold detection:** `listStalledDeals` in `src/lib/breakup-operations.ts` -
  tenant-scoped contacts in CONTACTED/REPLIED (or with a PipelineEntry stuck
  AWAITING_REPLY/STALLED) with no touch in `staleDays` (default 14,
  configurable 1-365), excluding anything already resolved (WON/LOST/ARCHIVED)
  or whose pipeline entry is already CLOSED. Oldest touch first.
- **Schema:** `BreakupDraft` (userId, contactId, `BreakupDraftStatus`
  PENDING/APPROVED/SENT/DISMISSED, subject, body, `generatedFrom` JSON
  snapshot of the staleness signal + grounding sources + model reasoning,
  createdAt, decidedAt). Additive; mirrored to `prisma/supabase-setup.sql`.
- **Generation:** `generateBreakupDraft` pulls the contact's real Activity /
  ContactEmail / ContactSocialMessage history and calls OpenAI
  (`generateObject`, zod-schema'd subject/body/reasoning) with a hard
  instruction to ground ONLY in that history and never invent facts - the same
  accuracy bar as enrichment (AGENTS.md). Idempotent: a contact with an
  existing PENDING draft is returned as-is, never regenerated or re-charged.
- **Approval queue:** approve sends via AgentMail if a send capability exists
  (see Debts below - it does not yet), else marks the draft `SENT` and calls
  `logOutreach` (channel email) so `lastContactedAt`/status advance honestly;
  dismiss marks `DISMISSED`. Both are **human-session-gated REST routes**
  (`src/app/api/breakup-drafts/[id]/{approve,dismiss}`) using
  `getAuthenticatedUser` (Clerk session only) - never reachable via an agent
  API key, so a prompt-injected agent cannot approve, and thereby send, its
  own draft. Editing subject/body before approval is supported
  (`PATCH /api/breakup-drafts/[id]`).
- **MCP + in-app agent:** `draft_breakups` (scan + generate, gated/rate-limited,
  metered) and `list_pending_drafts` (read-only) on both the MCP server and
  the in-app agent. Approve/dismiss are deliberately **not** MCP tools or
  agent tools.
- **Credits:** generation calls OpenAI (a paid provider), so it is metered -
  `CREDIT_COSTS.breakup_draft = 6`, priced like the other single-LLM-call
  actions (find_socials=4, contact_extract=8), well under deep_report's
  multi-source synthesis (8). Gated before the call (`ensureCredits`), debited
  only after the draft is generated AND persisted (`spendCredits`); the
  idempotent short-circuit for an existing pending draft never charges.
- **UI:** a dedicated dashboard card (`src/components/dashboard/breakup-queue.tsx`),
  styled to match the existing `needs-you.tsx` panel pattern (no restyle),
  listing pending drafts with Approve / Edit / Dismiss. Server component
  (`dashboard/page.tsx`) reads via the ops layer; the client component owns
  the interactions and removes a draft from view once decided. Renders
  nothing when the queue is empty - never a dead card.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | asserted -> reasoned | Founder brief asked for this directly; a breakup email is a well-known high-response pattern-interrupt, and "Scalar notices + drafts + holds for approval, never auto-sends" matches the product's non-negotiable human-in-the-loop-for-sending posture. |
| Feasible | PASS | tested | `tsc --noEmit`, full lint, `next build` (no DB) all green; 15 dedicated tests plus the full 176-test suite pass, covering cold-detection query shape, credit gating (never charge a miss, idempotent skip), tenant isolation on every op (including approve/dismiss/read of another user's draft), and the approve -> SENT transition's logOutreach side effect. |
| Deliverable | PASS | reasoned | One additive schema change, one new ops file following the exact `crm-operations.ts` convention, REST/MCP/agent/UI wired through the same ops layer so behavior is identical everywhere. No backfill needed. |
| Viable | PASS | reasoned | 6 credits/draft is margin-positive at the standard ~3x provider-cost pricing; the feature reduces churn risk (closing out dead pipeline honestly) rather than adding spend risk, since generation is idempotent per contact and bounded per scan call (max 25). |

**Tie-break:** none needed - no competing direction proposed. **Founder call
honored:** the brief explicitly required "never auto-send" and "only a Clerk
session approves" as hard constraints; both are enforced structurally
(`getAuthenticatedUser` is Clerk-session-only and is never used by the MCP or
agent code paths, which resolve identity from an API key/OAuth token instead).

## Debts owed to reality

- **AgentMail has no live send capability today.** `src/lib/agentmail.ts` is
  read-only (`getThreadsForContact`); there is no send function to call. Approval
  therefore always takes the honest fallback: mark the draft `SENT` and
  `logOutreach` so pipeline state advances for real, rather than pretending a
  live email went out. The one seam to change when a send capability exists is
  `approveBreakupDraft` in `src/lib/breakup-operations.ts` - attempt the live
  send first, fall back to the current path on failure or when unconfigured.
- **No live round-trip observed.** The whole feature currently stands at
  TESTED-in-build only (mocked-prisma unit tests + a schema-less `next build`).
  Owed: `pnpm prisma db push` (or let the deploy do it) against a real Supabase
  database, then one live pass - seed a stalled contact, run `draft_breakups`,
  approve from the dashboard, and confirm `lastContactedAt`/status/Activity
  all advance as expected.
- **No production credit-cost validation.** The `breakup_draft = 6` price is a
  reasoned estimate (same class as find_socials/contact_extract), not measured
  against actual OpenAI token spend at the `gpt-5-mini` grounding-context sizes
  this feature typically sends. Revisit once real usage data exists.
- **Deferred, not built:** notification/digest when new breakup drafts land
  (today the only signal is the dashboard card itself); a "snooze" action
  distinct from dismiss (dismiss is final - a snoozed-and-resurfaced-later
  path was judged out of scope for v1).
