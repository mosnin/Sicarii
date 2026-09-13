# Scalar pricing decision

Revision 1, 2026-09-13. A proposal and source audit, not observed willingness to pay or an activated catalog. Baseline 7922be8b22e6f7cd3e6041ddecfeceac8f0a4414.

## Customer and value metric
A founder, seller or small team that needs to investigate a defined prospect segment.
Alternative: Manual web research, spreadsheets, a separate CRM and a drafting assistant.
Propose a monotonic progression: Starter $49 with 3,000 credits, 1 member and 1 monitor; Grow $149 with 12,000 credits, 1 member and 10 monitors; Team $349 with 30,000 pooled credits, 5 members and 25 monitors. Keep the present $39 Starter, $99 Business and $129 Pro catalog visible separately; no existing account changes. Business has more monitors but fewer credits than Pro and must not say Everything in Pro.

## Plans
| Plan | USD per month | Included research credits per month |
| --- | ---: | ---: |
| Starter | $49 | 3,000 |
| Grow | $149 | 12,000 |
| Team | $349 | 30,000 |

## Source and unknowns
Source files inspected: src/lib/credits.ts, src/app/pricing/page.tsx, src/lib/agent-tools.ts, src/lib/exa.ts. These establish code and catalog behavior, not that deployed checkout, enforcement and invoices agree. Company OS and Symbolic reads are unavailable. No paid invoice, cohort usage distribution, support cost, customer interview or permissioned customer proof was retrieved. No competitor price claim is used.

## Economics and limits
`economics.csv` models one account-month at zero, half and all included usage under three assumed unit costs. Fixed account delivery cost $8 and payment cost 3% plus $0.30 on paid plans are assumptions, not provider quotes. Model excludes acquisition, company overhead, tax, refund variability and implementation costs. Contribution is not profit. Negative high-usage cases are explicit launch risks, not numbers to hide by averaging. Measure marginal costs and usage mix before activating changed allowances.

## Meter contract
Unit: research credits per month. The exact counted operation must be visible before commitment. Retained records are a stock, not a monthly spend. Proposed monthly event meters count a successful committed operation once per account and idempotency identifier. Refused and duplicated operations must not burn a second unit; successful earlier steps of a multi-step job may remain chargeable. Reconcile late events within 72 hours and issue corrections with an audit trail. These are proposed requirements where the runtime does not implement them.

## Lifecycle and spending
For new proposed plans: USD monthly, no automatic paid overages, optional top-ups require explicit purchase, no concealed annual commitment. Taxes if applicable additional. Included usage renews each cycle and does not roll over. Cancel stops the next renewal; account export and applicable retention terms remain available. At allowance exhaustion, pause paid automation and preserve read/review access. Do not silently delete records on downgrade. Failed payment pauses new paid work after an explicit notice and a proposed seven-day grace period; actual payment policy needs owner review. Confirm final cancellation, refund, top-up expiry, proration and data retention terms before launch. These proposal terms do not override existing contracts.

## Migration
Inventory active accounts, annual commitments, prepaid balances and custom agreements first. No automatic migration or retrospective rebilling. Existing users keep agreed terms while any revised offer is tested separately. Require provider catalog IDs, entitlement tests, meter reconciliation, notice, rollback mapping and support ownership before a price release. The website work does not activate billing or migrate customers.

## Alternatives and counterexamples
Keep current prices if cost and demand evidence does not support a change. Test a smaller allowance rather than hiding expensive usage. Light users may prefer free/manual tools. Heavy usage can exceed cost assumptions. A failed job must distinguish completed paid steps from retry duplicates. A disputed charge requires a visible ledger and review path. Annual discounts must display the full annual amount. Avoid guarantees of sales, productivity or retrieval correctness.

## Experiment
Recruit consenting users who already perform this workflow. Ask about their last real alternative and what they paid or spent time doing before showing the proposed price. Then test a bounded paid pilot only after separate activation authorization. Measure useful completed tasks, expectation accuracy, actual contribution, refunds and continuation after the first month. Stop exposure on billing mismatch, unexplained credit loss, material misunderstanding or negative high-usage contribution without an approved experiment budget. Interviews indicate interest; completed purchases and continued use provide stronger demand evidence.
