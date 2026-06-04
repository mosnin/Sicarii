# The Heading

> The one thing to push right now. Surfaced first by the Ratchet hook each
> session. Keep it to a glance; update it on every RECORD. (Volatile — the *aim*.)

**Binding constraint right now:** _The scaffolding is an **agency project-management**
app (projects, phases, onboarding, invoices, admin). Sicarii needs a **contacts
CRM + Discover + agent + product context**. The IA restructure is the gate
everything else waits on — and its shape is a Founder Call (what happens to the
existing Projects/admin/billing features?)._

**Next tasks** _(ranked by Priority = Alignment × Leverage × InfoValue ÷ Cost)_

| # | Task | Leverage | InfoValue | Cost | why it's next |
|---|------|----------|-----------|------|---------------|
| ① | **Founder Call: IA restructure** — keep/repurpose/remove the agency Projects/phases/onboarding/invoices/admin? Confirm Discover + CRM(contacts) + Agent chat + Product Context as the new dashboard. | H | H | L | unblocks every feature build; ambiguous → ask |
| ② | **Prisma migration** — Drizzle/Neon → Prisma on Supabase: `schema.prisma`, client, migrate ~11 API routes. | H | M | M | foundation for all new data (contacts, emails, context) |
| ③ | **CRM contacts** — `contacts` model + `/crm` list page + contact detail page. | H | H | M | the core entity; the "builds→crm" ask |
| ④ | **Discover** — find-&-save flow (enrich by domain, extract from URLs, find-emails) → save to CRM. | M | H | M | the acquisition motion |
| ⑤ | **AgentMail** — connect API key in Settings; render contact email threads. (docs.agentmail.to) | M | M | M | living-memory differentiator |
| ⑥ | **Built-in agent + MCP/skills** — chat to pull/enrich; expose CRM over MCP for OpenClaw/Hermes. | H | H | H | the soul; biggest build |
| ⑦ | **Product Context store** — agent-consumable knowledge base of what's being sold. | M | M | M | the "sell with understanding" wedge |

**Riskiest assumption under test now:** _That the agency-shaped scaffolding can be
bent into an agent-operated CRM faster than rebuilding the dashboard. Cheapest
falsifier: the IA decision (①) — once we know what stays, we know if reuse pays off._

**WIP on the critical path:** _1 — settle the IA (①) before writing feature code._

**DONE this session:** Ritual installed · scaffolding imported · full rebrand
(name, charcoal/white + `#1E4D2B`, dagger logo) · Gate Card 0001 stamped.

<!-- Founder Call: the Alignment ranking encodes taste. Founder confirms true north. -->
