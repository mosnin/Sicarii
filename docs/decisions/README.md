# Decision Ledger — the ratchet

> The product's **retained memory** — re-injected every session by the Ratchet
> hook so gains compound instead of leaking. Keep it tight and current: it is read
> in full at the start of every session, so every line must earn its place. The
> individual Gate Cards in this folder are the history; this is the *living
> summary* of what that history means.

The rule: **build on the patterns, pay the open debts, never re-open a kill or a
falsified claim.** Re-litigating settled decisions is exactly the leak that turns
exponential growth into a plateau.

> The *current aim* — what to work on next — lives in the more volatile
> `heading.md`. This ledger is the *accumulated* memory; the Heading is *where the
> vector points right now*. The Ratchet surfaces the Heading first, then this
> ledger.

---

## Patterns that keep passing (promote to defaults)

> Moves that have cleared the gates more than once. These become the house style.

- **Reuse the working skeleton for the undifferentiated 80%; spend invention on
  the wedge.** Built Scalar on the fortitudo scaffolding instead of greenfield. _(Card 0001)_
- **Brand color lives in one place.** All theme color flows from tokens in
  `src/app/globals.css`; rebrand = edit tokens, not hunt components. _(Card 0001)_
- **One ORM, one data path, ownership in every route.** Prisma only; every
  contact query is scoped by `userId`; API routes catch the `NextResponse` thrown
  by `getAuthenticatedUser`. _(Card 0002)_
- **Grep-sweep after a teardown.** After deleting modules, grep for dangling
  imports + dead route links before declaring done. _(Card 0002)_
- **Honest placeholders, not 404s.** Unbuilt nav destinations ship as branded
  "coming next" pages so the IA is whole. _(Card 0002)_
- **Verify before claiming SHIP.** Run `tsc --noEmit` + `eslint` + `next build`
  before stamping Feasible as TESTED. Caught real bugs (missing lucide brand icon,
  Prisma Json/enum typing). _(Card 0003)_
- **Honest partial over guessed parser.** For an unknown external response
  (Synthoz), build the request path, store the raw payload, gate behind the key
  (501), and parse once a real sample exists. _(Card 0003)_
- **One shared ops layer.** REST, MCP, and the agent all call `crm-operations.ts`
  (userId-scoped) — no logic drift across surfaces. _(Card 0004)_
- **Secrets hashed at rest, shown once.** API keys stored as SHA-256; plaintext
  surfaced a single time at creation. _(Card 0004)_
- **Verify third-party APIs against their real types.** Read the installed
  `.d.ts` before wiring (caught AI SDK **v6**'s async `convertToModelMessages`);
  tsc then catches misuse. _(Cards 0004, 0005)_
- **Gate every paid integration behind its key.** Synthoz/Tavily/OpenAI features
  build and run without keys (clear 5xx / no-op), so the app is never bricked by a
  missing secret. _(Cards 0003, 0005)_
- **Token-efficient memory = fresh context + recall.** Don't replay history; mint a
  fresh conversation per load and pull top-k vector matches on demand. _(Card 0005)_
- **One relationship, one thread.** Conversation history is channel-labeled and
  merged (email + social + calls on one record), never siloed per channel; new
  channels mirror the ContactEmail model shape. _(Card 0008)_
- **Discovery saves only what it can verify.** find_socials auto-saves a profile
  only on name AND company match; everything else is a candidate for review.
  Null over wrong, on every enrichment path. _(Cards 0003, 0008)_
- **Evidence is priced by the ledger, never self-graded.** The agent reports
  what it observed (typed kinds); noisy-OR scores it, a contradiction clamps to
  0.45, VERIFIED needs a primary source, and anything weaker becomes a PROPOSED
  suggestion a human settles instead of a discard. _(Card 0015)_
- **Hydrate, never resolve.** A provider with no identity signal (SocQ) may
  only enrich URLs already verified upstream; its search results land in a
  review queue with no code path to a record write. _(Card 0015)_
- **Queues lease, crons decide nothing.** Scheduled work is `AgentTask` rows
  claimed with FOR UPDATE SKIP LOCKED; the cron only invokes the dispatcher.
  Every task carries a reason shown to the operator. _(Card 0015)_
- **Only baseAmount is ever summed.** Deal money freezes its FX rate at write;
  a missing rate is null and disclosed ("3 deals in CHF not included"), never
  zeroed or converted on read. Rates are per tenant. _(Card 0015)_
- **The boundary is egress, enforced in code.** Customer text never leaves in a
  third-party query; Article 9 special-category data never lands on a record,
  whoever volunteered it. Guard wired into every provider client and the four
  shared record-write ops. _(Card 0015)_
- **Separate deployables hold no DB credentials.** The voice worker reaches the
  CRM only through a shared-secret internal API, idempotent by room name; a
  process with egress AND a DB connection is exfiltration-shaped. _(Card 0015)_
- **Verify SDK facts against shipped source, not memory.** Composio's initiate()
  retirement, LiveKit's missing PhoneNumberClient, and SocQ's absent identity
  signal were all found by reading published packages; each would have cost a
  rebuild if coded from training memory. _(Card 0015)_

## Open debts (owed to reality)

> Gates currently standing at REASONED, waiting on evidence.

| Debt | Gate / Card | Evidence owed | Owner |
|------|-------------|---------------|-------|
| ~~Build passes~~ ✅ | 0003 · Feasible | DONE — tsc + eslint + `next build` all green | eng |
| `prisma db push` live | 0003 · Deliverable | tables created on real Supabase | founder + eng |
| 5-second "quiet leverage" | 0001 · Desirable | observe on the deployed app | founder |
| Desirability with real users | 0001 · Desirable | first real users react | founder |
| Economics | 0001 · Viable | pricing/packaging set | founder + banker |
| External keys on Vercel | 0003 | Supabase, Synthoz, Tavily, AgentMail, Clerk | founder |
| Synthoz response → Contacts | 0003 | sample payload to parse | founder + eng |
| MCP runtime handshake | 0004 · Feasible | tool call from a real MCP client + key | founder + eng |
| Agent runtime (LLM loop, streaming, pgvector) | 0005 · Feasible | `OPENAI_API_KEY` + live run | founder + eng |
| pgvector `db push` | 0005 | enable `vector` ext on Supabase; push succeeds | founder + eng |
| 5-second spark (agent) | 0005 · Desirable | observe discover→push→enrich live | founder |
| find_socials verification quality | 0008 · Feasible | one live run with a real Tavily key | founder + eng |
| Social schema on prod | 0008 · Deliverable | `pnpm prisma db push` (new enums/table/columns) | founder |
| Provider keys encrypted at rest | audit 07-11 | agentMail/agentPhone keys hashed or KMS | eng |
| Teams v1 live round-trip | 0009 · Feasible | Clerk Orgs enabled + org webhook events + one live team flow observed | founder + eng |
| 0015 schema on prod | 0015 · Deliverable | `prisma db push` (23 new tables) | founder + eng |
| Composio sync live | 0015 · Feasible | auth configs + webhook; one reply observed advancing CONTACTED -> REPLIED | founder + eng |
| Voice live | 0015 · Feasible | worker deployed, one number bought, one inbound call answered from CRM data | founder + eng |
| SocQ storage/resale terms | 0015 · Viable | written confirmation BEFORE the key is set in prod | **founder** |
| CASA assessment | 0015 · Deliverable | scheduled (Gmail restricted scope was a deliberate founder call) | **founder** |
| STIR/SHAKEN attestation path | 0015 · Deliverable | carrier answer before outbound is enabled | founder + eng |
| Legacy AgentPhone removal | 0015 | delete after LiveKit voice is observed working | eng |
| agents/voice in CI | 0015 | deps installed + its 63 tests wired into the test run | eng |

## Kills & falsifieds (do not re-open)

> Ideas killed by the Ritual or falsified by the Altar. Recorded with *why*.

| What | Verdict | Why (one line) | Card |
|------|---------|----------------|------|
| Drizzle + Neon DB layer | REPLACED | founder call: Prisma ORM on Supabase Postgres instead | 0001/0002 |
| Orange brand palette | REPLACED | rebrand to charcoal/white + `#1E4D2B` green | 0001 |
| "Fortitudo" agency identity | REPLACED | rebranded to Scalar (agent-operated CRM) | 0001 |
| Agency app (projects/phases/onboarding/invoices/admin) | REMOVED | founder call "remove & replace"; wrong shape for an agent CRM | 0002 |

---

<!-- The hook reads this file verbatim each session. Prune ruthlessly: a stale
     ledger teaches every future session the wrong thing. -->
