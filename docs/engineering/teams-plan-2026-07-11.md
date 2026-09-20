# Teams / Workspaces - Implementation Plan (2026-07-11)

> Status: v1 BUILT (same day, Gate Card `decisions/0009-teams-v1.md`). Founder asked for a teams plan: personal account
> plus a team workspace with shared data, lead sharing from personal to team, and
> multiple agents connected per team. This is the grounded architecture plan; v1
> implementation is the next cycle after the social-channels PR.

## Ground truth (measured)

- Tenant isolation is `userId` scoping, everywhere: 453 occurrences of `userId` across 73 files in `src/`. Every domain model in `prisma/schema.prisma` hangs off `User` (11 relations); `FieldProvenance` is the only domain table with no userId (keyed by `recordType/recordId`), and `ContactEmail`/`ContactCall` scope through their contact.
- The ops layer is already a single choke point: every exported function in `src/lib/crm-operations.ts` (~25 ops) and `src/lib/field-operations.ts` (10 ops) takes `userId` as its first argument.
- Callers resolve identity in exactly three places: `getAuthenticatedUser()` in `src/lib/auth-utils.ts` (69 call sites across 49 API route files), `getDbUser()` in `src/lib/server-user.ts` (9 dashboard files), and the MCP auth handler in `src/app/api/mcp/[transport]/route.ts` (injects `extra.userId`, read at 32 tool call sites).
- Billing is keyed to `users.id`: `spendCredits(userId, ...)` does an atomic decrement on `User`, Stripe checkout stamps `metadata.userId`, and x402 top-ups resolve a user via API key.
- API keys are already multi-key per account with names (`ApiKey` model); `authenticateApiKey` returns `key.user`. OAuth access tokens carry `sub = userId`.
- Clerk already mirrors users into Postgres via webhook upsert on `clerkId`.

## Recommended architecture

Use **Clerk Organizations as the identity layer** and mirror each organization into the existing `users` table as a **synthetic "workspace account" row** (`clerkId = org_...`, `accountType = "workspace"`), with a `TeamMember` mirror table for membership/roles. Because every scoping site, the entire ops layer, the credit meter, API keys, OAuth `sub`, and the Stripe/x402 grant paths all key off a single `users.id`, a team workspace that IS a `users` row inherits shared contacts/entities/pipelines/segments/activity/conversations, pooled credits, a plan, and workspace-scoped MCP keys with zero changes to any query site. Context switching is Clerk's native org switcher: `auth()` returns `orgId` when a team context is active, and the two resolver functions resolve to the workspace row instead of the personal row. Sharing a lead is a deep copy with dedup-merge into the workspace account, and agent attribution is an additive `actorId/actorLabel` on `Activity` threaded from the MCP auth handler.

## Design decisions

### a. Identity: Clerk Organizations, mirrored

Enable Clerk Organizations; extend the existing Clerk webhook to handle `organization.*` and `organizationMembership.*`, mirroring into `users` (workspace row) and `team_members`, exactly like the existing `user.*` mirror. Invitations, invite emails, roles, the `OrganizationSwitcher` UI, and session-level active-org come free. Provision-on-first-sight in the resolver covers webhook races (the pattern already used for users).

### b. Data scoping: team = synthetic User row

- Option 1 (workspaceId on every row): cleanest end-state but ~13 models gain a column, ~25 composite indexes rewritten, all ops signatures, 153 route call sites, 32 MCP call sites, raw SQL in credits.ts, plus a production backfill. 2,500-3,500 LOC. Not a v1.
- Option 3 (nullable teamId + OR-scoping): strictly worse; one missed site is a cross-tenant leak. Rejected.
- Option 2 (synthetic User row, CHOSEN): `users.clerkId` is unique and Clerk org IDs (`org_...`) can never collide with user IDs (`user_...`). Every existing behavior becomes a team feature for free: shared CRM data, shared agent memory, workspace-level AgentMail/AgentPhone keys, pooled credits, workspace API keys.
- Honest risks: (1) type confusion, human-only flows running against a workspace row, mitigated with `accountType` gates in the ~6 human-facing surfaces (welcome, Pulse, settings profile); (2) org-deletion cleanup must be added symmetric to `user.deleted`; (3) `Activity.userId` becomes the tenant, not the actor, solved by additive `actorId`; (4) any future "iterate all users" job must filter `accountType = 'user'`.
- Migration path: purely additive (new columns nullable/defaulted, one new table); no backfill. A later formal `Workspace` model is a mechanical rename, not a re-scoping.

### c. Active-context switching

Mount `OrganizationSwitcher` in the dashboard shell. Clerk persists the active org in the session cookie. `getAuthenticatedUser()` and `getDbUser()` branch on `auth().orgId`: set means upsert/return the workspace row; unset means personal. All downstream call sites transparently operate on the right tenant.

### d. Sharing a lead personal to team: deep copy with dedup-merge

- Link rejected (cross-tenant FK leaks edits/deletes); move rejected (user keeps their personal account).
- Copy semantics: entity deduped by normalized domain then name (attach + fill-empty on duplicate); contact deduped by lowercased email then (name, company), merge fill-empty + union tags on duplicate; `FieldProvenance` rows copied re-keyed; activities copied with `actorLabel = "shared by <name>"`; emails/calls copied by default with an `includeMessages: false` toggle; memory chunks, segments, pipeline entries NOT copied. `source = "shared"`, `sharedFromId` stamped. One `prisma.$transaction`; the only two-tenant code path in the system, kept in one file (`src/lib/share.ts`).

### e. Agents / API keys: workspace keys work today, add attribution

Minting a key in team context already produces a workspace key (POST /api/keys uses the resolved account id). Multiple named keys = multiple agents concurrently. x402 self-payment credits the team pool with no changes. Add `ApiKey.createdById`, `Activity.actorId/actorLabel`; MCP auth handler injects `actorId: key.id, actorLabel: key.name`; v1 threads actor only into `logOutreach`/`addActivity`.

### f. Billing: flat team plan + pooled meter on the workspace row

`team: { credits: 30000, monitors: 25, seats: 5 }` in `PLANS`, `team: 299` in `PLAN_USD`. The meter lives on the workspace users row so `spendCredits`/`getBilling`/`applyPlan` work verbatim. Stripe checkout run in team context stamps the workspace row id; x402 grants hit the workspace pool untouched. Seat enforcement is a soft block in v1 (membership webhook counts vs plan seats).

### g. v1 cut (one PR, ~750 LOC)

| File | Change |
|---|---|
| `prisma/schema.prisma` | `User.accountType`, `TeamMember`, `Activity.actorId/actorLabel`, `ApiKey.createdById`, `Contact.sharedFromId`, `Entity.sharedFromId` |
| `src/app/api/webhooks/clerk/route.ts` | org + membership mirror, org deletion cleanup |
| `src/lib/auth-utils.ts`, `src/lib/server-user.ts` | org-aware resolvers (branch on `auth().orgId`) |
| `src/components/dashboard/dashboard-shell.tsx` | OrganizationSwitcher |
| `src/lib/share.ts` (new) | transactional deep copy + dedup-merge |
| `src/app/api/contacts/[id]/share/route.ts` (new) | POST share endpoint |
| contact page | "Share to team" action |
| `src/lib/credits.ts` | team plan |
| `src/app/api/billing/checkout/route.ts` | team price, admin gate |
| MCP route + crm-operations | actor attribution on activities |
| `src/app/api/keys/route.ts` | admin-gate minting in team context, stamp createdById |
| welcome/settings | `accountType === "user"` gates |

## Follow-up phases

1. Attribution everywhere (all ops writes, `CreditLedger.actorId`, per-agent spend reporting).
2. Roles/permissions on destructive ops; per-key scopes (read-only agent keys).
3. Sharing v2 (entities directly, bulk share segments, unshare/re-sync).
4. Seats billing (Stripe per-seat quantity sync; hard enforcement).
5. Optional formal Workspace model (mechanical rename).

## Top risks

1. Synthetic-user type confusion - gate human-only flows on `accountType`.
2. Org lifecycle gaps - symmetric `organization.deleted` cleanup, fail-loud so Clerk retries.
3. Cross-tenant leakage in the share path - single transactional function, ownership + membership asserted server-side, tests for "share to a team I'm not in".
4. Billing mis-scope - keys/tokens pinned to the account they were minted under; keys UI labels each key's context.
5. Resolver race / duplicate workspace rows - upsert on unique `clerkId = org_...`.
