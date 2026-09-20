# 0009 - Teams v1: shared workspaces on the synthetic account pattern

**Date:** 2026-07-11 · **Status:** SHIPPED (code) · **Owner:** the engineer (the banker on pricing)

## The decision

A user keeps their personal Scalar account and can also belong to team
workspaces with shared data and multiple connected agents. Architecture per
`docs/engineering/teams-plan-2026-07-11.md`:

- **Identity:** Clerk Organizations, mirrored by webhook (`organization.*`,
  `organizationMembership.*`) into a `TeamMember` table and a synthetic
  **workspace account row** in `users` (`clerkId = org_...`,
  `accountType = "workspace"`), provisioned on first sight by the resolvers so
  nothing depends on webhook ordering.
- **Scoping:** the workspace IS a users row, so all 450+ existing userId-scoped
  queries, the ops layer, the credit meter, API keys, OAuth, Stripe, and x402
  work for teams with zero query-site changes. Context switching is Clerk's
  OrganizationSwitcher (mounted in the shell); `getAuthenticatedUser` /
  `getDbUser` resolve to the workspace row when an org is active. A new
  `getAuthContext()` exposes `{account, actor, workspaceRole}` for the few
  places that need the human behind the account.
- **Sharing:** "Share to team" on the contact page deep-copies a personal lead
  into the workspace in one transaction (`src/lib/share.ts`): entity deduped by
  domain then name, contact by email then name+company (duplicates merge
  fill-empty + tag union), enrichment JSON, activities, provenance re-keyed,
  and (optional) emails/calls/social messages. `source = "shared"` +
  `sharedFromId` for provenance. Copy, never link or move.
- **Agents:** keys minted in team context are workspace keys; multiple named
  keys = multiple agents on one team CRM with one pooled meter. Only org
  admins mint them; `createdById` stamps the minting member. MCP writes are
  attributed: the auth layer passes the key id/name through and
  `log_outreach` / `add_activity` stamp `Activity.actorId/actorLabel`, shown
  in the activity feed.
- **Billing:** `team` plan, $299 per 30 days, 30,000 pooled credits, 25
  monitors, 5 seats (soft cap in v1). Bought via Stripe from team context by
  an admin (env: `STRIPE_PRICE_TEAM`), or by an agent over x402 `buy_plan`.
- **Human-only flows gated:** workspaces skip the `/welcome` first run.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | asserted -> reasoned | Founder asked directly; teams with shared agent-run CRM is the natural expansion of "the CRM your agents run". |
| Feasible | PASS | tested | tsc, eslint, next build green; additive-only schema; the synthetic-account pattern reuses every proven scoping path. |
| Deliverable | PASS | reasoned | One PR; no backfill; org lifecycle mirrored with fail-loud deletes. Owed: live Clerk org round-trip. |
| Viable | PASS | reasoned | $299/30d vs 30k credits ($300 at list) prices the pool at par and sells the collaboration + multi-agent surface; seat cap protects it. Founder may reprice. |

**Tie-break:** none. **Founder call honored:** pricing was proposed in the plan
and the founder said build, so $299 ships as the opening number; it is one line
to change (`PLAN_USD.team`).

## Debts owed to reality

- Enable **Organizations** in the Clerk dashboard (feature flag) and add the
  `organization.*` + `organizationMembership.*` events to the existing webhook
  endpoint's subscribed events. Set `STRIPE_PRICE_TEAM` when selling.
- One live round-trip: create an org, invite a second account, switch context,
  share a lead, mint a workspace key, agent writes over MCP, observe
  attribution. (The whole feature currently stands at TESTED-in-build only.)
- `pnpm prisma db push` for the new table/columns (or let the deploy do it).
- Seat enforcement is soft in v1; hard enforcement + per-seat Stripe quantity
  is phase 4 in the plan.
