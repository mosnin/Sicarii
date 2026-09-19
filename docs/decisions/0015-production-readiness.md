# 0015 - Production readiness (stop scaling features, stand up the factory)

**Status:** LOOP · stamped 2026-08-24 · owner: the producer (vision + banker advising)
**Verdict trail:** product audited against `main` @ `b235cdb` and live
production health. Plan:
`docs/engineering/production-readiness-plan-2026-08-24.md`.

## The decision

Do not scale signup or add surfaces. Execute the five-phase plan
(factory → bleed → production env → observed journey → then scale) until
the deliverable and viable gates climb off REASONED.

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | North Star still holds: agents need a structured body. The idea is a 9. The felt experience is still a 4. |
| ↳ 5-second gate | vision | FAIL | TESTED | Live `tryscalar.xyz` hero is concatenated copy. `app.tryscalar.xyz` returns 500. First-run has never been observed. Quiet leverage is not a feeling a stranger can have today. |
| **Feasible** | engineer | PASS (core) / FAIL (paths) | TESTED | 460 unit tests; shared ops layer; prod has Exa/Tavily/Explorium/Pipe0/OpenAI keys. Open P0s (#63 data loss, #64 send honesty) mean not every path works. |
| **Deliverable** | producer | FAIL | OBSERVED | GitHub default branch is the Ritual skeleton, not `main`. No CI. `prisma db push` on every deploy. 14 open agent PRs, several aimed at the wrong base. The factory cannot reproduce the product. |
| **Viable** | banker | FAIL | REASONED | Stripe and x402 missing in prod health. Checkout is 501. Upstash missing, so spend caps do not hold. Business/Pro pricing is inverted. No observed revenue. |

## The synthesis

- **Led by:** the producer. Scale is a factory problem, not a feature problem.
- **Tension:** vision wants the Four Moments felt; the last two months answered
  with more tools (66) and more cycles (0007-0014). The banker wants money
  on and spend capped. The producer wants one default branch and one CI gate.
- **Tie-break:** vision still wants *this* product, not a different one.
  Taste does not overrule a failed deliverable or viable gate. We keep the
  product and stop adding to it until the factory and the journey are real.

## Red-team

- **Most-inflated rung:** "billable" and "hardened" in the old heading. The
  meter is real (TESTED). Charging a stranger is not (REASONED, and the
  live health report says Stripe is missing). Knocked down.
- **Strongest case for KILL:** we have been planning production since June
  and shipping features instead. A plan without a default-branch fix is
  another document on a shelf. Counter: the product is real, providers are
  now funded, and the remaining work is sequenced and mostly already
  written as PRs. LOOP, not KILL.
- **What we missed:** `app.tryscalar.xyz` 500 is a first-user killer that
  no prior audit named. The Ritual-as-default-branch is a first-agent
  killer. Both are now Phase 0.

## Verdict and debt

- **Verdict:** **LOOP** → Phase 0 of the plan. Not SHIP. Not KILL.
- **Verification debt:** desirable 5-second gate, deliverable factory,
  viable money. All named in the plan with exit tests.
- **Owed to reality (founder):** default branch → `main`; repair or
  retire `app.tryscalar.xyz`; Upstash; Stripe prices + webhook; Clerk
  webhook + Orgs decision; `MCP_OAUTH_SECRET`; pricing ladder; watch
  one live discover → enrich → news and write felt / flat / broken;
  email-send now/later/never; invite-only cohort until Phase 3 exits.

## Hard rule this cycle

No new surfaces, providers, or tools. Merge the listed bug PRs. Do the
founder env. Observe the journey. Then, and only then, Phase 4.
