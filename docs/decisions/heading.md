# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile — the *aim*.)

**Binding constraint right now:** _The CRM + secure MCP are built and
build-verified, but the **Scalar agent** — the headline flow ("find nail salons
in Miami" → Tavily → push to CRM) — isn't built, and it needs an **LLM provider
key** + an **embedding provider** for the token-efficient vector memory. The
product can't be *felt* until the agent runs._

**Next task — the Scalar agent (token-efficient, with vector memory):**

| # | Task | Leverage | InfoValue | Cost | why it's next |
|---|------|----------|-----------|------|---------------|
| ① | **Agent chat** at `/agent` — runs an LLM loop over the **same tools** the MCP exposes (via `crm-operations`): `search_web`→review→`create_entity`, `enrich_entity`, etc. | H | H | H | the founder's headline flow; the five-second spark |
| ② | **Token-efficient memory** — each page load starts a **fresh conversation** (no history stuffed in context); a `recall` tool does **vector search** over (a) past messages and (b) CRM data (entity/contact notes, saved emails) to pull only what's relevant. | H | H | H | the founder's explicit ask |
| ③ | **Synthoz response → Contacts** parsing (needs a sample payload). | M | H | M | makes enrich populate the CRM |
| ④ | **AgentMail** wiring (Settings key + threads). | M | M | M | conversation context |
| ⑤ | **Deploy + `prisma db push`**; runtime-verify MCP from a real client. | H | H | L | proves it live |

**Vector-memory design (for ②):** add `Conversation` + `Message` Prisma models;
store an embedding per message (and per CRM note/email) using pgvector on Supabase
(`Unsupported("vector")` + raw similarity queries) or a hosted vector store;
embeddings via a provider (OpenAI `text-embedding-3-small` or similar — **Founder
Call: which key**). The agent's system prompt stays tiny; `recall(query)` fetches
top-k snippets on demand. Keeps tokens low while memory stays deep.

**Riskiest assumption under test now:** _That a fresh-context + vector-recall agent
feels as capable as one with full history. Cheapest falsifier: build ① + ② and try
the nail-salon flow once keys land._

**WIP on the critical path:** _1._

**DONE this session:** Ritual installed · scaffolding imported · full rebrand ·
IA restructured · Prisma-on-Supabase · CRM = Entities + Contacts · Synthoz client +
enrich · **secure MCP server (12 tools) + per-user API keys + shared ops layer** ·
all build-verified (tsc + eslint + next build green) · Gate Cards 0001–0004.

<!-- Founder Call: the Alignment ranking encodes taste. Founder confirms true north. -->
