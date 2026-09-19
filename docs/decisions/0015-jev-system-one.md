# Gate Card 0015: Jev as Scalar's System One

Date: 2026-09-19 · Verdict: **SHIP** (build-verified) · Led by: engineer → vision

> Founder: implement Jev into Scalar so decisions are an order of magnitude
> faster; power Scalar mostly by Jev + Qwen (OpenRouter) and voice by OpenAI.
> Rungs: ASSERTED(0)·REASONED(1)·TESTED(2)·OBSERVED(3).

## The gates

| Gate | Owner | Verdict | Rung | Evidence |
|------|-------|---------|------|----------|
| **Desirable** | vision · human | PASS | REASONED | The CRM your agents run should decide at software speed, not chat speed. Jev is the typed if-statement; Qwen is the pen; OpenAI is the voice. |
| ↳ 5-second gate | human | n/a | OWED | Observe route-intent, fit-score, and one agent turn on a live TypeSafe key. |
| **Feasible** | engineer | PASS | **TESTED** | Kernel + harness + wiring + unit tests. Jev never generates. Auto-mode wraps write tools. Model router pins Qwen for the turn. |
| **Deliverable** | producer | PASS | REASONED | One client, one policy file, one decide function. Existing heuristic/OpenAI paths remain as fallbacks. Env-gated: no key, no brick. |
| **Viable** | banker | PASS | REASONED | Jev input is $0.042/MTok, output free. Replacing gpt-5-mini classify/score calls is the cost win. Qwen only runs when `needsGeneration` is yes. |

## Design

- **Jev decides. Code routes. Qwen writes. OpenAI speaks.**
- LangChain harness: `routeModel` (ModelRouterMiddleware) + `autoMode` (block
  tool calls before execute).
- Symbolic layer (foreman, jev-code, jev-git, jev-review) and Company OS
  (opencompany overview + openwork warden packs) sit beside the CRM, not inside
  the chat model.

## Red-team

- **Most-inflated rung:** Feasible is TESTED for types and unit tests, not a
  live TypeSafe call. Thresholds are reasoned starting points (jevcal owed).
- **Risk:** auto-mode confirm-on-Jev-failure could stall writes if TypeSafe is
  down. Mitigated: no-key fails open; only a failed live call on a write asks
  for confirmation.
- **Strongest KILL case:** none. Chat models remain for generation.

## Debts owed to reality

- Live `TYPESAFE_API_KEY` + one observed 70-500ms route-intent.
- Sweep `src/lib/jev/policy.ts` on labeled CRM turns; pin `jev-1.13.0`.
- Confirm OpenRouter Qwen model ids against the current catalog.
- Confirm OpenAI Realtime session shape against a live key.
