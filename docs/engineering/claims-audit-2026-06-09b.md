# Claims-vs-Delivery Re-Audit, 2026-06-09 (v2)

Follow-up to `claims-audit-2026-06-09.md` after the four-agent fix pass (#28).
Same question: does the software reliably deliver what we publicly claim? Each
previously-red item was re-checked against the merged code, and the new billing
code was scrutinized hardest (billing is where bugs hide).

## Verdict

**Much closer - the integrity-critical gaps are closed in code.** The pricing
page is now backed by a real meter, the fabricated agency pages are gone, export
exists, and there is a test suite. One genuine bug was found in the new billing
code (metered actions charged *after* doing the work, so a zero-credit user got
results for free) and is **fixed in this pass**. The remaining gaps are
activation/infra and one verification that only the founder can do.

## Scorecard delta (was -> now)

| Claim | Prev | Now |
|---|---|---|
| Pricing tiers are purchasable / metered | 🔴 no billing code | 🟢 **Credit meter live**: ledger, plan/credits on User, per-action debits, plan-gated monitors, Creem checkout + signed webhook, Settings billing card. Existing users on beta/10k, new on free/200. |
| "Never charged for a miss" + credits actually gate paid actions | 🔴 unenforced | 🟢 **Now enforced.** Fixed the ordering hole this pass: a pre-flight `ensureCredits`/`hasCredits` blocks an out-of-credits user BEFORE the provider call and before any data is saved; the debit still happens only on success, so a real miss is free. Bulk loops gate per record. |
| "Owned, exportable" | 🔴 no export | 🟢 CSV export for contacts + companies (rate-limited, full-account), wired into the CRM menu. |
| FAQ / portfolio / about authenticity | 🔴 agency fiction | 🟢 portfolio + services deleted; FAQ + about rewritten from the foundation docs; footer/proxy cleaned. |
| Free tier "MCP read-only" | 🔴 false (free got full write) | 🟢 claim corrected to "Full MCP + agent" - credits are the real limit, which matches the code. |
| Automated tests exist | 🔴 zero | 🟢 33 tests (rate limiter, OAuth/PKCE/typ-confusion, webhook fail-closed, logo, junk guards, credit constants/plan resolution). |
| "Connect your agent over MCP, it just works" | 🟡 OAuth unverified live | 🟡 unchanged - protocol correct, OAuth handshake still never exercised against a real client. |
| "Deeply enriched in seconds" | 🔴 failing in prod | 🟡 the `pipe_id` bug is fixed; **still owed: top up Explorium/Pipe0 + one observed live run.** |
| "Structured, deduped" | 🟡 app-layer dedup | 🟡 unchanged - DB unique constraints still owed (needs a dedupe-first migration). |

## The bug this pass fixed (detail)

The four metered enrichment paths (contact-enrich, entity aspect enrich,
deep-report, analyze-site) called the paid provider, saved the result, and only
*then* called `spendCredits`, which throws 402 when out of credits. A
zero-credit user therefore: triggered the provider (we pay), got the enrichment
saved to their CRM, and merely saw a 402 - i.e. unlimited free enrichment at the
provider's (our) expense. Bulk-enrich leaked one free record per call the same
way. Fix: `ensureCredits` pre-gate before every provider call; bulk loops call
`hasCredits` at the top of each iteration and stop cleanly. The agent route was
already correct (debits up front). Residual: a sub-second race between the
pre-check and the debit could still let one action through after a concurrent
spend - bounded and acceptable; the atomic decrement remains the source of truth.

## Still owed (unchanged from the scale + claims audits)

- **Founder, to make the core claim true:** fund Explorium/Pipe0; run one live
  discover -> enrich -> news and watch it land. Activate Creem (products + keys)
  so checkout goes live.
- **Infra:** Upstash env vars (else rate limits are per-instance); `prisma db
  push` -> `migrate deploy`; DB unique constraints (dedupe first); pgvector index.
- **Code, next:** OAuth token revocation; the `/terms` page still has agency-era
  legal copy (needs a real SaaS ToS); webhook idempotency; CRM list virtualization.

## Bottom line

Of the three P0 integrity gaps, two (unsellable pricing, fabricated pages) are
fully closed in code, and the third (enrichment works) is one funded-account +
one observed run away. The product now *measures up to its claims in code*; what
remains is activation, one live verification, and the standing infra list.
