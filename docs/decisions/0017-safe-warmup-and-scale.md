# 0017 - Safe warmup volume, not Instantly scale

**Date:** 2026-09-21 · **Status:** SHIP (research + skills) · **Owner:** engineer (vision held the product cut)

## The decision

Scale the mailbox by warming an identity, not by blasting. Default daily
caps are the **floor** of public provider limits and vendor ramps, not
Instantly marketing numbers. Mailbox stays an identity. No peer-network
warmup. No fake opens.

The long evidence lives in `docs/engineering/mailbox-warmup-limits.md`.
Code constants live in `src/lib/mailbox-warmup-limits.ts` so the sibling
implementer can import them without a fight over `mailbox-warmup.ts`
(that file is mid-rewrite: hourly caps, warmup-vs-cold remaining).

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Quiet leverage is "it already sent, and it landed." A burned domain is the opposite. First five seconds on /mailboxes should still be a domain + an inbox + a clock, not a sequencer. |
| Feasible | PASS | reasoned | Provider hard limits are documented (Google Help 2026-09-18, Microsoft Learn, Google sender guidelines 2024-02-01 / FAQ Nov 2025). The ramp is a conservative function of those sources. Not yet wired into the live send path (implementer owns that). |
| Deliverable | PASS | tested | Unit tests pin the default profile: 0 cold through day 20, first ready day = 5 cold, steady ceiling 20. Skills registered the same way as `scalar-mailboxes`. |
| Viable | PASS | reasoned | Slower send preserves the inbox add-on. One ruined domain costs more than a week of waiting. |

**Tie-break:** vision over "match Instantly's 30-40/day so we look serious."
Five honest sends beat forty junked ones.

## Red-team

- **Most-inflated rung:** Feasible is reasoned, not observed. We have not
  watched Postmaster spam rate or inbox placement on a Scalar domain.
- **Strongest case for KILL:** writing a ramp without live mail is
  astrology. Rebuttal: shipping 40/day as the leftover table *is* the
  reckless act. Publishing a conservative floor with named sources is the
  honest one.
- **What we missed:** a founder-owned "already warm" attestation can be
  wrong. BYOK still caps at 25 and still stops on bounce, complaint, or
  auth fail.

## Debts owed to reality

- One live warmup: new domain, DNS passing, sink mail for 21 days, then
  five real cold sends. Record bounce, complaint, and placement.
- Implementer wires `dailyTotalCapForDay` / `maxColdSendsForDay` into the
  send path and deletes the leftover 5/10/20/30/40 table.
- Founder: never mark ready to skip a dirty inbox.

## What we did not decide

- Peer-network warmup (killed in 0015 / 0016, stays killed).
- Turning Scalar into a sequencer.
- Raising the new-domain ceiling above 20 without observed placement.
