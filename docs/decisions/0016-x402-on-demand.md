# 0016 - x402 on-demand (pay per call or contact)

**Date:** 2026-08-19 · **Status:** SHIPPED (code) · **Owner:** banker + vision
(founder directive)

## The decision

A subscription is an included monthly allowance on the existing credit meter.
It is not the only way in. A connected agent can buy **one call** or **one
contact** with USDC over x402, then keep working. Extra usage after a plan
runs dry is the same path: `pay_for` for the exact sku, or `buy_credits` for
a pack.

One meter. Purchased credits sit on it. The original tool still spends only
when a lookup hits, so a miss never burns the payment.

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Founder asked for pay-per-call and buy-contacts-on-demand, with a plan only granting included usage. |
| Feasible | PASS | tested | Reuses x402 verify/settle + `addCredits` idempotency. SKU catalog is derived from `CREDIT_COSTS`. Unit tests cover prices, unknown skus, and the 402 sku hint. |
| Deliverable | PASS | reasoned | No schema change. New route `POST /api/x402/pay`, MCP `pay_for`. Env-gated like the rest of x402. |
| Viable | PASS | reasoned | Same $0.01/credit as packs and plans. Contact SKU is LinkedIn+email (11) or plus phone (23). Margin stays the 3x provider rule already on each action. |

**Tie-break:** none. **Founder call honored:** on-demand first, subscription as
allowance.

## How it works

- `src/lib/x402-skus.ts` - contact bundles + one SKU per metered action.
- `src/lib/x402-grant.ts` - shared settle-then-credit (packs and per-call).
- `POST /api/x402/pay` `{ sku, quantity? }` - HTTP 402 then grant.
- MCP `pay_for` - two-step quote / settle, same resource URL as the HTTP route.
- Out-of-credits errors carry `{ sku, quantity, need }` so the agent pays for
  that call instead of guessing a 1000-credit pack.
- REST metered routes return the same 402 contract (`code`, `sku`, `pay.endpoint`)
  so an HTTP agent can POST `/api/x402/pay` and retry. The in-app agent tells
  the operator; it has no wallet of its own.

## Hardening (audit)

- HTTP and MCP quotes share `resourceUrl()` (never `req.url.origin`). A Host
  header or preview origin cannot mint a payment that settles against a
  different resource.
- SKU lookup uses `Object.hasOwn` plus an allowlist regex. Inherited keys
  (`__proto__`, `constructor`) are not payable.
- A payment nonce that already credited account A is refused for account B.
- `X402_PAY_TO` must be a 40-hex EVM address. `X402_NETWORK` is only `base` or
  `base-sepolia`.
- Pack size is checked in the MCP buy path, not only by the tool schema.
- A settled nonce is written to `X402Settlement` before the credit/plan grant.
  A retry after a post-settle DB blip skips settle (the nonce is spent) and
  still grants. A nonce that credited account A is refused for account B even
  after A is deleted (no User FK cascade on the settlement row).
- HTTP subscribe and MCP `buy_plan` share `settleAndApplyPlan` with the same
  recover-after-settle path as packs and per-call SKUs.
- `addCredits` rejects a grant above `MAX_CREDIT_GRANT`. `applyPlan` records
  the actual GREATEST balance, not the allotment.
- `planForPriceId` includes the team plan so a portal switch cannot miss it.
- `resourceUrl` only accepts an http(s) origin.
- Intent monitors and research schedules debit only on a hit.

## Debts owed to reality

- One live `pay_for` settlement on Base (the same Phase 0 debt as 0007).
- If settle succeeds and the settlement row never writes, a retry still cannot
  auto-grant (the nonce is spent and we have no marker). That case is logged
  CRITICAL `settled_but_unrecorded` with the tx hash for manual reconcile.
