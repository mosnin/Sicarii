# Gate Card NNNN — <decision in one line>

Date: YYYY-MM-DD · Verdict: **SHIP | LOOP | KILL** · Led by: <method>

> The stamped verdict for a significant decision. Short and glanceable on
> purpose — if it takes more than a glance to read the call, rewrite it. Full
> system: `framework/05-the-gate-card.md`. Evidence rungs: ASSERTED (0, never a
> pass) · REASONED (1) · TESTED (2) · OBSERVED (3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence (what actually backs this) |
|------|-------|---------|------|-------------------------------------|
| **Desirable** | vision · human | PASS/FAIL | OBSERVED | *the observed reaction — not an opinion about one* |
| ↳ 5-second gate | vision | PASS/FAIL | TESTED | *is the opening moment proven? how?* |
| **Feasible** | engineer | PASS/FAIL | TESTED | *what ran — spike, test, benchmark vs. the real constraint* |
| **Deliverable** | producer | PASS/FAIL | REASONED | *did the path reproduce? how many times?* |
| **Viable** | banker | PASS/FAIL | TESTED | *the number, computed from real inputs* |

## The synthesis

- **Led by:** *which method owned the call*
- **Tension:** *where methods genuinely conflicted*
- **Tie-break:** *if two paths both passed — how vision chose; else "converged"*

## Red-team (one adversarial pass before SHIP)

- **Most-inflated rung:** *the gate claiming more evidence than it has — knocked down, or defended*
- **Strongest case for KILL:** *argue in good faith why this shouldn't exist; if half-convincing, don't SHIP*
- **What we missed:** *the worst-day user, the failure mode, the cheaper thing that makes this unnecessary*

## Verdict & debt

- **Verdict:** **SHIP** / **LOOP** (→ back to which step) / **KILL** (and why it's a win)
- **Verification debt:** *which gates are still at REASONED, and when reality pays them off*
- **Owed to reality:** *the evidence you could not gather yourself — name it and hand
  it to the founder (e.g. "needs 5 real first-runs," "needs a production cost number").
  Never invent it. A claimed rung you didn't reach is the one unforgivable act.*

<!--
  KILL is a celebrated outcome. If desirability said "this should not exist,"
  say so plainly here and stop — that is a win, not a failure.
-->
