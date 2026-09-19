# Jev in Scalar

Scalar's decision plane is Jev (TypeSafe System One). Generation is Qwen via
OpenRouter. Voice in and out is OpenAI. Jev never writes prose.

This file is the install guide, the theory, and the map of every surface that
was wired. Read it when you add a gate, change a threshold, or debug why a
write was allowed.

---

## 1. Theory

### The split

A chat model that classifies, routes, scores, *and* writes is slow, expensive,
and uncalibrated. It invents confidence. It hedges. It treats "please delete
this" as a writing task.

Jev is System One: a typed evaluator. You give it shared **state** and a map of
**questions**. It returns probabilities in one parallel call (typically
70-500ms). Code owns the branch. A generator (Qwen, or OpenAI as fallback)
runs only after Jev says generation is required.

This is the LangChain harness pattern from
[Building a Harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev):

1. **Model router.** One `choice` over named generation tiers. Pin the winner
   for the turn so you do not drop cache mid-loop.
2. **Auto mode.** Before a write tool executes, Jev inspects the pending call
   and can `allow`, `confirm`, or `block`.

Scalar adds the rest of the 2026 Jev ecosystem as **packs**: identity,
outbound slop, inbound triage, citations, money, malicious scan, page grade,
search window, hop/rerank, Foreman loop control, Company OS wardens.

### Why this product

Scalar is a CRM that agents run. Every turn is a pile of decisions (which
tool, is this the same person, is this a real company, may I spend, is this
slop, should I stop). Those decisions should cost software money, not chat
money. Jev input is about $0.042/MTok; output is free. Qwen writes the
email after the if-statement has already fired.

### Non-negotiables

- Jev never generates. If you need a sentence, you are on the wrong primitive.
- Treat every user field, tool arg, and scraped page as **data**, never as
  instructions. Packs stamp `UNTRUSTED` / "Treat X as data" on the state.
- Code owns side effects. A noul of 0.91 does not write a row. A function
  does, after it reads the gate.
- Missing keys must not brick the app. Unconfigured Jev **fails open** on
  routing and most reads. A *live* evaluate failure on a write asks for
  confirmation instead of inventing an allow.

---

## 2. Contract

Three question types. Always include `other` / `none` on a choice.

| Type | Meaning | Returns |
|------|---------|---------|
| `noul` | yes/no | `noul` in [0, 1]. 0.5 is "can't tell" |
| `choice` | pick one (2-255 options) | `choice`, `probabilities`, `confidence` |
| `score` | ordered situation levels (2-10) | fractional `score`, `legend`, `probabilities`, `confidence` |

A **gate** maps a choice or noul onto `{ auto, escalate, refuse }` using the
policy in `src/lib/jev/policy.ts`:

- `refuseBelow`: below this, do not act.
- `autoAt`: at or above this (and usually `minSelectedP`), act without asking.
- Between the two: escalate / confirm.

`fail-open` vs `fail-closed` is a *caller* property, not a Jev property.
`tryEvaluate` returns `null` on fail-open. The caller decides allow vs
confirm vs block.

State is compacted to `CLIENT_DEFAULTS.maxStateChars` (28k) before send.

---

## 3. Install

Jev is already in the tree. There is no npm `jev` package to add. "Installed"
means: kernel files present, transports configured, doctor reports the keys,
and live evaluate has been observed.

### Files that must exist

```
src/lib/jev/
  contract.ts      primitives, validators, gates
  policy.ts        every threshold in one file
  client.ts        TypeSafe -> Gateway -> OpenRouter
  decide.ts        turn orchestrator (instant local routes first)
  instant.ts       regex System One for obvious CRM turns
  query.ts         lookup prefix strip / maps split
  runtime.ts       evaluate memo + circuit breaker
  facts.ts         CRM fact card + invented-name check
  compact.ts       hermes-style transcript prune
  harness.ts       model router + auto-mode
  gates.ts         identity, slop, warden, triage, citations, money, ...
  generate.ts      Qwen / OpenAI generation picker (not evaluate)
  score.ts         fit + rank batches
  route-intent.ts  discovery catalog choice
  voice.ts         spoken-intent choice + Whisper/TTS/Realtime
  telemetry.ts     [jev-decision] logs (no answer bodies)
  index.ts         public exports
  packs/           intent, guard, loop, scoring, identity, money, angles
  eval/validate.ts jevcal helpers
src/lib/symbolic/  Foreman, jev-code, jev-git, jev-review
src/lib/company-os/ overview + warden packs
scripts/jevcal.mjs
fixtures/jevcal/*.json
```

### Env (names only)

```
TYPESAFE_API_KEY=...          # preferred native evaluate
TYPESAFE_AI_API_KEY=...       # alias accepted by the client
AI_GATEWAY_API_KEY=...        # fallback evaluate (typesafe-ai/jev)
VERCEL_AI_GATEWAY_API_KEY=... # alias
OPENROUTER_API_KEY=...        # Qwen generation + optional Jev eval
OPENROUTER_JEV_MODEL=...      # default typesafe/jev-1.13
TYPESAFE_JEV_MODEL=...        # default jev-latest; pin jev-1.13.0 after sweep
OPENAI_API_KEY=...            # voice, embeddings, generation fallback
SCALAR_POLICIES=...           # optional pipe-separated policy quotes
```

Transport order for `evaluate`:

1. Native `POST https://api.typesafe.ai/v1/systemone`
2. Vercel AI Gateway `evaluate` (`typesafe-ai/jev`)
3. Optional OpenRouter `typesafe/jev-1.13`

Qwen is **never** used for evaluate.

### Prove the install

```
pnpm run doctor      # TypeSafe Jev / Gateway / OpenRouter rows (`pnpm doctor` is pnpm's own CLI)
pnpm env-doctor      # same script
pnpm jevcal          # threshold sweep on fixtures/jevcal
pnpm exec tsc --noEmit
pnpm test            # includes tests/jev-*.test.ts
```

`pnpm run doctor` in this cloud checkout reports TypeSafe / Gateway / OpenRouter
as **missing**. That is expected: the app boots, every gate fails open, and
no live 70-500ms call has been observed. Production needs at least
`TYPESAFE_API_KEY` (or the Gateway / OpenRouter fallback) before the safety
story in this file is real.

The app still boots with none of these keys.

---

## 4. Failure modes (read this before you ship)

| Situation | Routing / classify | Write tool (auto-mode) | Money / send / memory |
|-----------|--------------------|------------------------|-----------------------|
| No Jev key | fail-open (heuristic / allow) | allow unless `JEV_REQUIRED=1` (then confirm) | allow unless `JEV_REQUIRED=1` (then block / stop) |
| Live evaluate error | fail-open (`null`) | **confirm** if `isWriteTool(name)` | money: block; autopilot: stop; send: block; identity + malicious scan: block |
| Jev answers | code applies policy.ts | block destructive/exfil; confirm the rest | `GATES.money.autoAt` |

`isWriteTool` covers prefixed names (`create_contact`, `buy_credits`) **and**
MCP rate-limit buckets that have no prefix (`create`, `enrich`, `remember`).
A live TypeSafe outage on those buckets must ask for confirmation, not allow.

MCP auto-mode receives the **zod-parsed args** (never an empty `{}`). Payment
blobs (`xPayment`) are not sent to Jev; only `{ credits, hasPayment }` /
`{ plan, hasPayment }`. `compactState` / `redactEvaluateState` strip
`xPayment`, tokens, and secrets from every evaluate (HTTP, MCP, kernel)
before the request leaves Scalar. HTTP `/api/x402/topup` and
`/api/x402/subscribe` call `gateMoney` the same way MCP buy tools do.

Unconfigured Jev still silently disables identity, malicious scan, and spend
authorization **unless** `JEV_REQUIRED=1` (or `true` / `yes`) is set. Production
should set that flag once a TypeSafe, Gateway, or OpenRouter Jev key is in
the environment. Local/dev stays fail-open so a missing key does not brick
the app.

---

## 5. Policy and calibration

All thresholds live in `src/lib/jev/policy.ts`. They are **reasoned starting
points**, not observed calibration.

Sweep labeled noul fixtures:

```
pnpm jevcal
pnpm jevcal fixtures/jevcal/identity.json
```

When a live sweep on Scalar CRM turns holds target accuracy, set
`TYPESAFE_JEV_MODEL=jev-1.13.0` (`JEV_PINNED_MODEL` in policy.ts).

Telemetry: `logJevDecision` writes `[jev-decision]` with surface, action,
source, reasons, latency, and answer *keys*. It does not dump answer bodies
or raw state.

---

## 6. Kernel map

| Module | Job |
|--------|-----|
| `contract` | `noul` / `choice` / `score`, validate, `gateChoice`, `gateNoul` |
| `client` | transports, retry 429/529, `tryEvaluate` |
| `policy` | `GATES`, `TOOL_GATE`, slop / malicious / citation floors |
| `decide` | intent + risk + tool + skill + generation tier -> Handler |
| `harness` | `routeModel`, `autoMode`, `runAutoModeThen` |
| `gates` | every high-leverage if-statement (see packs below) |
| `generate` | pick Qwen-fast / Qwen-strong / OpenAI after Jev grants prose |
| `score` | batched fit (score) and rank (noul) |
| `route-intent` | discovery catalog |
| `voice` | spoken CRM intent + OpenAI media |
| `packs/intent` | turn intent / risk / needsGeneration |
| `packs/guard` | tool guard, output secrets, failureClass, malicious, policy |
| `packs/loop` | action / goalDone / stuck / earlyStop, compact, quiet-ask |
| `packs/scoring` | fit, rank, slop, page grade, citations, triage, search window, hops |
| `packs/identity` | same-person + real-company |
| `packs/money` | spend + autopilot tick |
| `packs/angles` | swarm dimension nouls; code fills query templates |

Jev cannot extract free-text parameters or invent swarm angle strings. It
picks dimensions and tools. Code fills templates.

---

## 7. Wired surfaces

| Surface | Jev job | Generator |
|---------|---------|-----------|
| `/api/agent` | Instant path (lookups, lists, discover, create, enrich, tell-me-about, follow-ups, credits, autopilot, yes-after-miss). Unique CRM hits become a fact card, not a chat turn. Generate and escalate use a short grounded system prompt, compacted transcript (hermes-jev-compact), slim tool results, and a local invented-name gate. | Qwen or OpenAI, and only if needed |
| `/api/discover/route-intent` | Choice over the discovery catalog | heuristic params |
| `/api/crm/fit-score` | Score per record vs product context | none |
| `/api/crm/semantic-sort` | Noul per record vs intent | none |
| `/api/crm/triage-inbound` | Inbound category / action / severity / urgency | none |
| Voice webhook + `/api/voice/*` | Spoken CRM intent; follow-up rank | OpenAI Whisper/TTS/Realtime |
| `/api/symbolic/review` | Foreman / jev-code / jev-git / jev-review | none |
| `/api/company-os/overview` | Deterministic reads; wardens on writes | none |
| MCP writes + `jev_*` | Auto-mode **with args**, money gate, triage, citations, grade, scan, loop | none |
| Breakup draft / approve | Slop + warden before persist / send | gpt-5-mini draft only |
| Contact enrich | Same-person identity gate before save | none |
| Discover refine / radar / swarm | Real-company noul; angle dimensions | LLM extract fallback |
| Autopilot tick | Spend brake (continue / downgrade / stop) | none |
| Deep report | ICP overlay + citation drop on news/intent | Qwen/OpenAI prose |
| Tavily / Firecrawl / Google SERP | Time window + off-topic rerank + BFS hop keep | none |
| Analyze site | Page grade stored on the entity | none |
| find_companies / maps / swarm / bulk | Real-company noul before insert | none |
| save_email / inbound social / remember | Warden + malicious scan | none |
| Segment / pulse | Jev rank overlay on cosine / latest | embeddings |

---

## 8. HTTP and MCP

Authenticated HTTP (`getAuthenticatedUser` on every route):

| Method | Path | Job |
|--------|------|-----|
| POST | `/api/jev/evaluate` | raw System One evaluate |
| POST | `/api/jev/decide` | turn orchestrator |
| POST | `/api/jev/verify-citations` | claim/quote keep |
| POST | `/api/jev/grade-page` | page / draft letter grade |
| POST | `/api/crm/triage-inbound` | inbound classify |
| POST | `/api/symbolic/review` | symbolic review |
| GET | `/api/company-os/overview` | Company OS read |
| GET | `/.well-known/company-os-app` | connector advert |

MCP tools (all `gated`): `jev_evaluate`, `jev_decide`, `jev_triage`,
`jev_verify_citations`, `jev_grade_page`, `jev_scan_malicious`, `jev_loop`.

Write MCP tools run `runAutoModeThen(bucket, pendingArgs, "MCP <bucket>", ...)`.
That includes `update_segment`, `delete_segment`, `remove_segment_member`,
`delete_pipeline`, and `remove_pipeline_entry`. MCP replies are compact JSON
(`stripHeavyFields`); they do not pretty-print enrichment blobs.
Read tools stay on `run()`.

---

## 9. Symbolic layer and Company OS

**Symbolic** (`src/lib/symbolic`): Foreman nine nouls plus loop
goalDone/stuck/earlyStop; jev-code exact diff checks; jev-git gate;
clean-code review. Presentation never asks Jev to invent the next patch.

**Company OS** (`docs/COMPANY_OS.md`): opencompany-shaped typed API + live
CRM reads. Wardens are nouls (`pii-review`, `quote-accuracy`, `crm-schema`,
`outbound-tone`, `permission-scope`). Code blocks at >= 0.75. Wired on
outbound social, outbound email (log phase), and breakup drafts.

---

## 10. How to add a gate

1. Add questions to a pack in `src/lib/jev/packs/` (or a new pack).
2. Add a function in `gates.ts` that calls `tryEvaluate`, reads
   `asNoul` / `asChoice` / `asScore`, and returns a typed verdict.
3. Put new thresholds in `policy.ts` only.
4. Call the function from the **ops layer** (or a single route), not from
   three copies in REST / MCP / agent.
5. Fail open when unconfigured; decide confirm vs allow on live miss.
6. Export from `index.ts`. Add a unit test with a mock client.
7. Update the surface table in this file.

Do not ask Qwen to classify.

---

## 11. What was built

Two stacked branches off Scalar `main`:

1. **`cursor/jev-scalar-core-bb09` (PR #100).** Kernel, harness, decide,
   first wiring: agent loop, route-intent, fit-score, semantic-sort, voice,
   symbolic, Company OS, MCP auto-mode + `jev_*`, breakup slop/warden,
   enrich identity, discover/radar/swarm real-company + angles, autopilot
   brake, deep-report ICP overlay.

2. **`cursor/jev-remaining-gates-bb09` (PR #101).** Packs that were exported
   but unused: search window, page grade, hop/rerank, `scanMalicious` on
   email/remember/inbound social, jevcal CLI, citations on deep-report,
   find/maps/swarm/bulk real-company filter, segment/pulse rank overlay,
   Foreman loop nouls, `failureClass` retry, MCP auto-mode **args**, write
   buckets without a prefix.

3. **`cursor/jev-fast-path-bb09` (PR #102).** Skip `streamText` after Jev
   picks a lookup/discover tool. `after()` memory. HTTP x402 `gateMoney`,
   live-miss identity/scan block, evaluate redaction.

4. **`cursor/jev-instant-core-bb09` (PR #103).** Local instant routes,
   800ms routing budget, circuit breaker, evaluate memo, speculative CRM
   prefetch.

5. **`cursor/jev-grounded-core-bb09`.** Fact cards, invented-name gate,
   hermes transcript prune, slim tool results, unique-record cards, instant
   enrich / tell-me-about, ICP score overlay on analyze.

6. **`cursor/jev-loop-core-bb09`.** MCP payloads drop enrichment/transcript
   blobs and pretty-print. Segment/pipeline deletes go through auto-mode.
   Discover dedupe queries only the incoming names/domains. Segment build
   excludes pipelined contacts in SQL. Instant follow-ups and credits skip
   TypeSafe. List runners no longer bounce through `searchCrm`. Recall
   overlaps decide. `jev_decide` takes `priorAssistant`. Routing skips
   tool-guard questions on non-write utterances. Agent `search_web` /
   `google_search` join auto-mode. Getters omit enrichment. Escalate uses
   the grounded system prompt. Autopilot pause is gated. Segment/pipeline
   reads are capped. Instant understands "follow up". HTTP decide takes
   `priorAssistant`. Fast-path prints autopilot budget from the payload.
   Outreach, activity, calls, and call prompts are scanned. Autopilot
   proposals go through `gateMoney`. Recall is rate-limited at the ops
   layer. Pipeline add/metrics and HTTP entity/contact reads are bounded.
   Tool turns hide unused paid discovery. Contact getters skip channel
   history. Notes, variants, and breakup edits are scanned. Instant
   variant pick/stats skip TypeSafe. Instant Field reads (segments,
   pipelines, drafts, swarm runs) skip TypeSafe. Paid discovery is
   rate-limited at the ops layer. Segment/pipeline/autopilot text is
   scanned. Inngest crons take at most 50 due jobs. HTTP Field
   create/list uses the ops layer. Schedule and monitor queries are
   scanned. Instant email/activity/call/social history skips TypeSafe.
   The in-app agent can save emails and create variants under auto-mode.
   Live Jev misses on identity, generated output, and log-phase wardens
   deny. Unconfigured still fails open.

Repo patterns were distilled, not vendored. Eighty Jev GitHub repos do not
belong in `node_modules`. The kernel is the house style.

---

## 12. Security posture (sweep 2026-09-19)

Reviewed. No unauthenticated Jev HTTP control plane. Telemetry does not log
answer bodies. User text is labeled untrusted in evaluate state. Payment
blobs (`xPayment`) never enter Jev state.

Fixed in the same sweep:

- MCP auto-mode was evaluating `{ pending_args: {} }`. It now receives the
  tool's parsed args.
- MCP buckets `create` / `enrich` / `remember` did not match `WRITE_HINT`,
  so a live Jev failure **allowed** the write. `isWriteTool` now includes
  those buckets plus `search_web` / `serp_search`.
- Inbound social had triage but no malicious scan. Email and social now
  both scan inbound and outbound.
- In-app `storeMemory` (free per-turn) now scans the same way billed MCP
  `remember` does.
- Autopilot tick **stops** when a live evaluate fails (unconfigured still
  continues, unless `JEV_REQUIRED` is set).
- `JEV_REQUIRED=1` is the production fail-closed flag. Doctor reports it.

Still owed (documented):

- Live TypeSafe observation (no key in this checkout).
- Labeled CRM-turn jevcal, then pin `jev-1.13.0`.
- Unconfigured identity, scan, money, and write gates still fail-open
  unless `JEV_REQUIRED=1`. Live evaluate misses on those surfaces now
  deny (including real-company filter, generated-output scan, and
  log-phase wardens).

See `docs/engineering/jev-sweep-2026-09-19.md`.

---

## 13. Lineage

Classification / routing: notra, jev-router, typesafe-jev, eve, jev-ultrafast,
decide-mcp, typesafe-ai/skills, tumf/jev-cli.

Guardrails: is-malicious, pi-jev, jev-review, abide, hunch, pi-heed, JevSlop,
citation-verifier, spendbrake.

Loop: hermes-jev-compact, pi-quiet-ask, Foreman.

Scoring: unclutter, jevcal, page-grade / search-intent / bfs-hop packs.

Identity / money / angles: same-person noul, spendbrake, swarm dimension
choice (code fills queries).

Symbolic: foreman, jev-code, jev-git, clean-code-review.

Company OS: opencompany + openwork warden packs.

Harness: LangChain "Building a Harness with Jev".

---

## 14. Why this is faster (the X pattern)

TypeSafe and LangChain show 70-500ms System One vs multi-second chat
classify. The 10x people post is not "Jev sits next to gpt-4o." It is
**Jev decides, code acts, the generator stays dark.**

Scalar now does that on `/api/agent`:

1. `classifyInstant` handles obvious CRM utterances in process (show me X,
   find companies, add Acme as a company, "yes" after an empty miss). TypeSafe
   stays dark. This is the Hermes / Pokemon-harness pattern: the if-statement
   is free when the utterance is not ambiguous.
2. Speculative `searchCrm` starts before `decideTurn` returns. User-message
   persist overlaps the same window.
3. Ambiguous turns still call Jev, but routing uses an 800ms / 0-retry budget.
   Three live failures open a 20s circuit so a down TypeSafe hop cannot stack
   2.5s retries. Successful evaluates memoize for 45s.
4. If the turn is lookup/analyze or a routed read/discover/create tool,
   `executeFastPath` runs the ops layer and `fastPathResponse` streams the
   same UI SSE. No `streamText`. No tool-schema tokens.
5. If Jev grants generation, `pickActiveTools` hides unused tools so the
   generator sees a smaller catalog.
6. `storeMemory` embeddings run in `after()`, not before the first token.
7. Unique CRM hits become a **fact card** (name, domain, industry, people).
   "Tell me about Acme" does not open Qwen.
8. Generate path is grounded: short system prompt, last 8 turns, tool dumps
   dropped on older turns (hermes-jev-compact), tool results slimmed to
   id/name/domain, `<crm-facts>` injected from prefetch + recall.
9. Local invented-name gate: if Qwen names a company/email/domain that is
   not in the fact card, the reply is replaced with a refusal. Jev
   `inventedCrm` is backup when keys are present.
10. Instant `enrich Acme` resolves the record and runs enrich under auto-mode.
    Analyze turns overlay ICP fit when product context exists.
11. `list companies` / `list contacts` hit the list tables (no enrichment
    blob, no contact join on companies). `who needs a follow-up` and
    `how many credits do I have` are instant too.
12. Recall starts next to decide/prefetch and is only awaited on the
    generate path. Routing skips `TOOL_GUARD_QUESTIONS` unless the utterance
    looks like a write. Auto-mode still gates every write tool.
13. MCP `ok()` is compact JSON without pretty-print. Heavy fields
    (`enrichment`, `transcript`, embeddings) are stripped. `get_entity`
    and `get_contact` omit enrichment at the database on agent and MCP.
    Segment and pipeline deletes use `gated` + auto-mode, including
    `remove_*` and `pause_autopilot`.
14. Agent `search_web` / `google_search` run auto-mode like MCP. Recall is
    rate-limited. Escalate turns use `GROUNDED_SYSTEM`. Fast-path prints
    autopilot spend from the real payload. HTTP `/api/jev/decide` accepts
    `priorAssistant`. Segment and pipeline lists/gets are capped.
15. `logOutreach`, `addActivity`, `saveCall`, and `placeContactCall` scan
    artifacts the same way email/social do. `proposeAutopilotPlan` runs
    `gateMoney`. `recallMemory` rate-limits every caller. `addToPipeline`
    caps segment expansion. `pipelineMetrics` aggregates in SQL. HTTP
    entity/contact detail pages cap nested lists. HTTP decide accepts
    optional `tools` / `skills` catalogs.
16. A routed tool turn only exposes `READ_CORE` plus the picked tool.
    `get_contact` omits email/social history unless asked. MCP dumps
    truncate long `body`/`notes`. Notes, variant text, and breakup edits
    are scanned. Instant `pick a subject line` / `variant stats` skip
    TypeSafe. Autopilot cron loads at most 50 due plans.
17. Instant `list segments` / `show pipelines` / `pending drafts` /
    `swarm runs` skip TypeSafe. Agent exposes those list tools. Paid
    ops (`find_companies`, maps, swarm, enrich, extract, SERP) are
    rate-limited at the ops layer so MCP cannot bypass HTTP limits.
    Segment, pipeline, and autopilot proposal text is scanned.
    Intent-monitor and research-schedule crons take 50. Company OS
    counts follow-ups instead of loading 200 rows.
18. HTTP Field create/list goes through the ops layer (scan + cap).
    Research schedules, intent monitors, and API keys lists take 50.
    Schedule and monitor queries are scanned before persist.
19. Instant `show emails for Jane` / `list activities for Acme` /
    `show calls for Jane` skip TypeSafe. The in-app agent now has
    `list_emails`, `list_activities`, `list_contact_calls`, `log_outreach`,
    and `add_activity` (auto-mode), matching MCP.
20. Instant `show linkedin messages for Jane` is social history, not
    email. The agent has `list_social_messages`, `save_email_context`,
    and `create_variant` under auto-mode.
21. A live TypeSafe miss on identity (`filterRealCompanies` /
    `keepNamedCompanies`) drops the batch instead of inserting unverified
    companies. Generated output and log-phase wardens deny on a live miss.
    Unconfigured still fails open.

Lookups and instant creates work when OpenRouter/OpenAI are unset. Discovery
still needs its provider keys. Write tools still pass auto-mode.

---

## 15. Debts owed to reality

- Live `TYPESAFE_API_KEY` and one observed 70-500ms route-intent.
- `pnpm jevcal` on **labeled CRM turns** (not only fixtures); then pin
  `jev-1.13.0`.
- Confirm OpenRouter Qwen model ids against the current catalog.
- Confirm OpenAI Realtime session shape against a live key.
- Set `JEV_REQUIRED=1` on production once a Jev key is present.
