# 0007 - x402 agent payments (the CRM pays its own way)

**Status:** SHIPPED (code) · stamped 2026-06-10 · owner: Vision + the banker
(the human advising) · deepens 0006
**Verdict trail:** founder directive. "Integrate x402 payments for topping up
extra usage and paying for the subscription if agents are connected." This card
records the build and the gate verdicts.

## What it is

A connected agent can now pay in USDC over HTTP, with no human in the loop, to:

- **Top up usage credits** when the meter runs dry: `POST /api/x402/topup`
  (optional `{ credits }`, priced at par with plan credits, $0.01 each).
- **Buy a plan for 30 days**: `POST /api/x402/subscribe` (`{ plan }`:
  starter / pro / business), settled in USDC.

Both speak the x402 protocol: the first call returns HTTP 402 with payment
requirements, the agent's x402 client signs a USDC authorization and retries
with an `X-PAYMENT` header, and we verify + settle through a facilitator before
granting anything. A `GET` on each endpoint returns the price menu with no
charge, for discovery. When the credit meter throws "out of credits" over MCP,
the error now carries a one-line pointer to the top-up endpoint, so an agent
can pay its own way and retry instead of stalling.

This is the thesis made literal: *the CRM your agents run* now includes the
agents paying for it. Card payments by humans stay on Creem; x402 is the
agent-native rail alongside it, not a replacement.

## Gate verdicts (synthesis order)

- **Desirable:** PASS (founder directive). On-thesis: agent-operated billing is
  the natural end of "operated by AI agents." Vision: an agent that can buy its
  own credits when it runs out is the difference between a tool and a teammate.
- **Feasible:** PASS (tested at the unit rung). Built on x402 v1.2.0
  (`x402` + `x402-next`) with the v1-compatible Coinbase CDP facilitator
  (`@coinbase/x402@1.0.1`) for mainnet and the public facilitator for testnet.
  Verify/settle handled by the facilitator; we never touch chain or gas. Pure
  pricing/requirements logic is unit-tested; live settlement is owed to reality.
- **Deliverable:** PASS (reasoned). Env-gated exactly like Creem: without
  `X402_PAY_TO` the endpoints return 501. No schema change (reuses
  `CreditLedger` with reliable, idempotent writes). Disjoint from the
  four-moments tracks, so it integrated cleanly.
- **Viable:** PASS (reasoned). Top-ups are priced at par with plan credits and
  every action is already margin-positive (roughly 3x provider cost), so
  pay-as-you-go is margin-positive too. USDC settlement on Base is near-zero
  fee. The 30-day plan pass keeps the same allotment economics as Creem.

**Founder calls made:** default network is **Base mainnet** (real USDC via the
CDP facilitator), still 501 until `X402_PAY_TO` + `CDP_API_KEY_*` are set.

**Debts owed to reality (cannot be closed in code):**
- One observed live settlement on Base mainnet (fund the treasury wallet, set
  the CDP keys, watch one top-up land). This is the x402 sibling of Phase 0.
- Idempotency rests on two guards: the on-chain single-use nonce (only one
  settlement per payment can succeed) and a `CreditLedger` ref check. The
  ledger check has a small write race under concurrent identical requests; the
  on-chain nonce is the hard backstop. Acceptable; revisit if abused.

## How it works (for the next session)

- `src/lib/x402.ts` - config + env-gating, `buildRequirements`, `readPayment`,
  `verifyPayment`, `settlePayment`, `paymentRef` (nonce idempotency key),
  `topUpHint`. Testnet uses the public facilitator; mainnet lazy-loads the CDP
  facilitator only when configured.
- `src/lib/credits.ts` - `addCredits` (money in, reliable + idempotent ledger
  write), `alreadyCredited`, `applyPlan`, `PLAN_USD`.
- `src/lib/auth-utils.ts` - `resolveRequestUser` (API key bearer, then Clerk).
- `src/app/api/x402/topup` + `.../subscribe` - the two endpoints.
- `src/proxy.ts` - `/api/x402(.*)` is public (self-auth + X-PAYMENT proof).
- Env: `X402_PAY_TO`, `X402_NETWORK`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`.
- Tests: `tests/x402.test.ts`.
