# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile — the *aim*.)

**Binding constraint right now:** _Everything is built and **build-verified**, but
nothing has been **observed running**. The whole product (agent, MCP, enrich,
vector memory) is gated on keys + a live DB the founder controls. The product
can't be *felt* — or trusted — until it runs once, end to end, on the deploy._

**Next task — light it up (verification + the last data wires):**

| # | Task | Leverage | InfoValue | Cost | why it's next |
|---|------|----------|-----------|------|---------------|
| ① | **Set keys on Vercel + `pnpm db:push`** (enable pgvector on Supabase). Keys: Clerk, Supabase `DATABASE_URL`/`DIRECT_URL`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, `SYNTHOZ_API_KEY`. | H | H | L | unblocks every observed rung |
| ② | **Observe the spark** — run "find nail salons in Miami" → push → enrich, live. Falsify or confirm the agent feels like quiet leverage. | H | H | L | the 5-second test (founder) |
| ③ | **Synthoz response → Contacts** parsing — needs one real payload to map enrichment into contact rows. | M | H | M | makes enrich populate the CRM |
| ④ | **AgentMail** wiring (Settings key + threads on the contact page). | M | M | M | conversation context for cold email |
| ⑤ | **MCP runtime handshake** — connect a real MCP client with an API key, call a tool. | M | H | L | proves the agent-access surface |

**Riskiest assumption under test now:** _That fresh-context + vector-recall feels as
capable as full history, AND that pgvector `db push` + the v6 streaming loop work on
the real deploy. Cheapest falsifier: ① + ② once keys land._

**WIP on the critical path:** _none — awaiting founder (keys + db push)._

**DONE this session:** Ritual installed · scaffolding imported · full rebrand to
**Scalar** · IA restructured · Prisma-on-Supabase · CRM = Entities + Contacts ·
Synthoz client + enrich · **secure MCP server (12 tools) + per-user API keys** ·
**Scalar agent at `/agent`** (OpenAI, 13 tools, fresh-context + pgvector recall) ·
merged to `main` (PR #1) · all build-verified (tsc + eslint + next build green) ·
Gate Cards 0001–0005.

<!-- Founder Call: the Alignment ranking encodes taste. Founder confirms true north. -->
