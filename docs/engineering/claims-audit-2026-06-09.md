# Claims-vs-Delivery Reliability Audit, 2026-06-09

The previous audits asked "is the code secure and scalable?" This one asks the
founder's question: **does the software reliably deliver what we publicly
claim** - on the homepage, the pricing page, the FAQ/footer pages, and the
foundation docs? Every claim below was checked against the code on `main`
(`e2a7b52`), not from memory.

## Verdict

**Not yet.** The engineering is in genuinely good shape - tenant isolation is
clean, the accuracy rule is enforced in code, the security and scale hardening
landed, the MCP surface is correct. But three public claims are currently
**not deliverable**, and one of them involves money. We are claims-forward and
verification-backward: per the Heading, the product has still never been
observed running end to end.

## Claims scorecard

| Public claim | Where | Status |
|---|---|---|
| "Point your agent at Scalar over MCP and it just works" | hero, how-it-works | 🟡 **Mostly true.** Protocol + 26 tools correct; API-key path solid. The OAuth connector handshake has never been exercised against a real client (owed to reality since #17). |
| "Deep enrichment... in seconds" / "intelligence at agent speed" | hero, intelligence section | 🔴 **Failing in prod today.** Explorium returns 403 (account out of credits); the first successful Pipe0 call has never been observed (the `pipe_id` fix merged 2026-06-08 but is unverified live). The whole intelligence claim rests on funded provider accounts + one observed end-to-end run. |
| "Structured, **deduped**, and yours" / "0 junk records" | hero, stats band | 🟡 **Not structural.** Dedup is app-layer check-then-create; concurrent ingestion (webhook + cron + agent, designed to run together) can still create duplicates. DB unique constraints are still owed. Junk-value guards are real and good. |
| "Owned, **exportable**, never resold" | valueprop, product.md | 🔴 **No export exists.** There is no CSV/JSON export anywhere in the app. CRM lists also cap at 200-500 records with no pagination, so a power user cannot even *view* all their data, let alone export it. |
| Pricing tiers ($39/$129/$99) with a 50% launch sale | /pricing | 🔴 **Cannot be transacted.** There is no billing code at all - no Creem integration, no credits ledger, no schema fields, no plan gating. Every CTA goes to free sign-up. "Free = MCP read-only" is also unenforced (free users get full write). **We are advertising a sale on products that cannot be purchased.** |
| "1 scheduled monitor / 10 / 25" per tier | /pricing | 🟡 Monitors work, but per-tier limits are unenforced and Inngest's production registration is unverified. |
| "Never charged for a miss" | /pricing | 🟡 Vacuously true (nothing charges). The enrich paths do distinguish miss vs provider-error correctly now. |
| Accuracy hard rule (never the wrong person/company) | product.md, AGENTS.md | 🟢 **Enforced in code** on all audited paths (LinkedIn name+company match, email domain-fit, phone person-echo, match-entity name verification). The one claim we now structurally keep. |
| FAQ / portfolio / about pages | footer links | 🔴 **Still the agency's.** "How does the process work?", "Luxury Fashion Store", "35+ Happy Clients" - fabricated claims live on our domain today, worse than the fake testimonials we already removed. |

## Reliability fundamentals (independent of claims)

- **Zero automated tests.** Every verification to date is typecheck + lint +
  build + reasoning. No test exercises the enrich waterfall, the OAuth flow,
  the rate limiter, or dedup.
- **No error monitoring.** `console.log` only; no Sentry/alerting. In prod we
  learn about failures when the founder pastes Vercel logs.
- **Durable rate limiting unconfirmed.** Code is ready; whether
  `UPSTASH_REDIS_REST_URL/TOKEN` are set in Vercel is unknown. Unset = limits
  are per-instance.
- **Deploy still `prisma db push`** (data-loss class risk on drift); pgvector
  index is a manual Supabase step, run status unknown.
- **Never observed end to end.** The five-second spark - discover, enrich,
  records landing - has not been watched in production by anyone.

## What we DO reliably deliver today

CRM CRUD + search + segments + pipelines (isolated, validated, bounded); the
26-tool MCP server over API keys; the security posture (OAuth redirect
validation, webhook auth, SSRF guard, creation budget, input bounds, provider
timeouts); the accuracy rule; a fast, coherent marketing site.

## Ranked gap list (claims-integrity first)

**P0 - integrity-critical, before any promotion of the site:**
1. **The pricing page sells what can't be bought.** Either build the billing
   meter (credits ledger + Creem checkout + plan gating) or soften the page to
   a waitlist/"early access - free during beta" framing. Advertising a 50%-off
   sale with no checkout is the kind of claim that costs trust permanently.
2. **Fund the providers and observe one real run.** Top up Explorium, confirm
   Pipe0 credits, then run discover -> enrich -> news live and watch it land.
   Until then, the core promise is unverified.
3. **Replace or remove the FAQ/portfolio/about agency pages** - fabricated
   client claims are live on the domain now.

**P1 - makes currently-false claims true:**
4. CSV export (small feature; makes "exportable" honest) + list pagination.
5. DB unique constraints (dedupe live rows, then `@@unique`) - makes "deduped"
   structural.
6. Confirm Upstash env vars + Inngest registration + pgvector index in prod.

**P2 - reliability floor for a paid product:**
7. Tests on the money paths (enrich waterfall incl. provider-failure modes,
   OAuth, rate limiter, dedup); error monitoring (Sentry); `prisma migrate`.

---

*Method: claim-by-claim reconciliation of the live marketing/pricing/docs
against the code on `main`, with each uncertain claim verified by inspection.
Status date 2026-06-09.*
