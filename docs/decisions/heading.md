# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile — the *aim*.)

**Binding constraint right now:** _The data layer is built and **build-verified**
(tsc + eslint + `next build` all green), but nothing is **live**: no Supabase
tables yet, and the three external brains (Tavily search, Synthoz enrichment,
AgentMail email) plus the **MCP server** are unwired. The product can't *act*
until the agent + MCP land on real data._

**Next tasks** _(ranked by Priority = Alignment × Leverage × InfoValue ÷ Cost)_

| # | Task | Leverage | InfoValue | Cost | why it's next |
|---|------|----------|-----------|------|---------------|
| ① | **Deploy + `prisma db push`** on real Supabase; smoke-test CRUD; observe the 5-second spark. | H | H | L | turns a green build into a living app |
| ② | **Secure MCP server** + rich toolset over the CRM (list/create/enrich entities & contacts, search, save email context) — auth'd for OpenClaw/Hermes/Claude Cowork. | H | H | H | the soul: agents plugging into the context |
| ③ | **Sicarii agent (chat)** — Tavily search → entities → push to CRM; Synthoz enrich tools; create records. | H | H | H | the founder's headline flow |
| ④ | **Synthoz response → Contacts** — wire real responses into Contact records (needs a sample payload + key). | M | H | M | makes enrich actually populate the CRM |
| ⑤ | **AgentMail** — Settings key + send/sync into `ContactEmail`; render threads. | M | M | M | conversation context for outbound |
| ⑥ | **Product Context store** + **marketing/settings retune**. | M | L | M | wedge + polish |

**Riskiest assumption under test now:** _That Synthoz/Tavily/AgentMail behave as
the screenshots/docs imply. Cheapest falsifier: one real call each once keys land._

**WIP on the critical path:** _1._

**DONE this session:** Ritual installed · scaffolding imported · full rebrand ·
IA restructured · **Prisma-on-Supabase** · **CRM = Entities + Contacts** (CRUD,
detail, assignment, email-thread store, status/delete) · **Synthoz client +
enrich endpoint** · honest Discover/Agent/Context placeholders ·
**build verified (tsc + eslint + next build green)** · Gate Cards 0001–0003.

<!-- Founder Call: the Alignment ranking encodes taste. Founder confirms true north. -->
