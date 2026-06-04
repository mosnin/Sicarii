# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile — the *aim*.)

**Binding constraint right now:** _Nothing is build-verified. The CRM cycle is
written and internally consistent, but `pnpm build` has not run in this
environment — and it needs a Supabase database + Clerk keys to come alive. Until
someone runs install/migrate/build with real env, every gate sits at REASONED._

**Next tasks** _(ranked by Priority = Alignment × Leverage × InfoValue ÷ Cost)_

| # | Task | Leverage | InfoValue | Cost | why it's next |
|---|------|----------|-----------|------|---------------|
| ① | **Build verification** — `pnpm install && pnpm db:push && pnpm build`; fix TS fallout (likely Prisma enum/Json typing). Needs Supabase + Clerk env. | H | H | L | discharges the 0002 debt; proves the slice real |
| ② | **Discover wiring** — pick an enrichment provider; wire enrich-by-domain + find-emails → save to CRM. | H | H | M | the acquisition motion; first real data in |
| ③ | **Built-in agent** — chat with read+write CRM tools; then expose the same over MCP for OpenClaw/Hermes. | H | H | H | the soul of the product |
| ④ | **AgentMail** — Settings key connection + send/sync into `ContactEmail`; render real threads. | M | M | M | lights up the living-memory store |
| ⑤ | **Product Context store** — agent-consumable knowledge base + UI. | M | M | M | the "sell with understanding" wedge |
| ⑥ | **Marketing + settings retune** — replace remaining agency copy (hero, pricing, testimonials, about, settings/Creem) with Sicarii messaging. | M | L | M | polish; not blocking |

**Riskiest assumption under test now:** _That the written code compiles and the
Prisma schema migrates cleanly on Supabase. Cheapest falsifier: run task ①._

**WIP on the critical path:** _1 — get a green build before adding features._

**DONE this session:** Ritual installed · scaffolding imported · full rebrand ·
**IA restructured** (agency app removed; Discover/CRM/Agent/Context/Settings) ·
**Prisma-on-Supabase** foundation (Drizzle/Neon removed) · **CRM contacts** CRUD +
detail + email-thread store + honest placeholders · Gate Cards 0001, 0002.

<!-- Founder Call: the Alignment ranking encodes taste. Founder confirms true north. -->
