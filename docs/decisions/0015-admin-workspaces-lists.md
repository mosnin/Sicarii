# 0015 - Admin desk, CRM lists, Scalar-native workspaces

**Date:** 2026-08-15 · **Status:** SHIPPED (code) · **Owner:** vision (human + banker on metering)

## The decision

Three surfaces, one posture: Scalar stays a quiet CRM, not a second product.

1. **Platform admin desk** (`/admin`). Operators (`User.role = admin`, bootstrapped
   by `ADMIN_EMAILS`) manage people, grant credits, set plans, issue Stripe
   refunds, and open the billing portal. Admin usage is unlimited; rate limits
   still apply. Every action writes `AdminAction`.
2. **CRM lists and segments on the CRM page.** The book is no longer one pile.
   Named lists (manual membership) and smart lists (saved filters: industry,
   tag, status, search) sit beside the contact table. Field's prompt-built
   segments stay; they show up here too.
3. **Scalar-native workspaces.** A workspace is still a synthetic `users` row
   (Teams v1). You can now create one in-app (`ws_<uuid>`) for another business
   without Clerk Organizations. Cookie `scalar_workspace` selects it when no
   Clerk org is active. Free = personal only; paid plans unlock more; platform
   admins have no cap. Each workspace keeps its own contacts, lists, pipelines,
   and meter.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Founder asked for the desk, lists, and per-business workspaces in one breath. The CRM page is the place lists must live or 100k contacts stay unsortable. |
| Feasible | PASS | tested | Additive schema; existing userId scoping reused; unit tests for admin identity, list filters, workspace quota, isolation on addSegmentMembers. |
| Deliverable | PASS | reasoned | One PR. No backfill. `prisma db push` on deploy. Owed: live admin grant + one native workspace round-trip. |
| Viable | PASS | reasoned | Free cannot mint extra workspaces (users pay). Admins are a cost center on purpose. Refunds move money, not the meter, so comps stay explicit. |

**Tie-break:** none. **Founder call honored:** build the three together; same aesthetic.

## Debts owed to reality

- Set `ADMIN_EMAILS` (and optionally stamp `users.role = admin`) so the desk is reachable.
- `pnpm prisma db push` for `Segment.kind/rules` and `admin_actions`.
- One live pass: create a native workspace, make a list, grant credits, refund a test charge.
