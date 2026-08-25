# 0008 - Social channels: profiles, discovery, and conversations

**Date:** 2026-07-11 · **Status:** SHIPPED (code) · **Owner:** the engineer (vision + the human advising)

## The decision

Leads live on social platforms, not just email. Scalar now treats LinkedIn, X,
Instagram, and Facebook as first-class channels in three ways:

1. **Profiles on the record.** `Contact.facebook / instagram / twitter` join the
   existing `linkedin` column. Editable in the contact UI (SocialsEditor), on the
   new-contact form, settable by agents over MCP and the in-app agent, exported
   in CSV, and shown in Details with provenance pills.
2. **Discovery with the accuracy hard rule intact.** `find_socials` (MCP tool +
   contact-page button, shared op in `src/lib/social-find.ts`) searches the web
   (Tavily) and AUTO-SAVES only profiles verified against the contact's name AND
   company. Everything else returns as unverified candidates for one-click human
   (or reasoned agent) confirmation. Null over wrong, always. 4 credits on a hit,
   free on a miss.
3. **Conversations across channels.** New `ContactSocialMessage` model (channel,
   direction, body, threadRef) mirrors `ContactEmail`. Logged over MCP
   (`log_social_message` / `list_social_messages`), by the in-app agent, or
   manually from the contact page. The contact page's "Saved context" card became
   **Conversations**: email + social merged into one time-ordered, channel-labeled
   thread. Pipeline state stays honest automatically: OUTBOUND stamps
   `lastContactedAt` and advances NEW/ENRICHED to CONTACTED; INBOUND advances
   CONTACTED to REPLIED.

Lead attribution: `create_contact` (MCP + agent) now accepts `source` so an agent
that finds a lead on a social platform records where it came from instead of the
generic "agent".

## The gates

| Gate | Verdict | Rung | Evidence |
|---|---|---|---|
| Desirable | PASS | reasoned | Founder asked directly; "the CRM your agents run" is incomplete if the agent can only remember email. One thread per relationship regardless of channel is the felt win. |
| Feasible | PASS | tested | tsc, eslint, `next build` all green; mirrors proven ContactEmail/ContactCall patterns; shared-op layer keeps REST/MCP/agent identical. |
| Deliverable | PASS | tested | Additive schema only (3 columns, 2 enums, 1 table); `prisma db push` applies it; supabase-setup.sql updated in step. |
| Viable | PASS | reasoned | find_socials priced at 4 credits (Tavily-backed, ~3x provider cost, house pricing rule); logging/reading conversations free (writes are free everywhere). |

**Tie-break:** none needed; no gate conflicted.

## Debts owed to reality

- Live observation: run find_socials against a real contact with a real Tavily
  key and confirm verification quality (the name+company heuristic is reasoned,
  not observed).
- `prisma db push` on production before this ships (new enums/table/columns).
- Social message SEND is out of scope on purpose: Scalar tracks conversations;
  agents send through the platforms themselves. Revisit only if reality demands.

## Also in this cycle (MCP audit remediation)

Deep MCP audit 2026-07-11 (`docs/engineering/mcp-audit-2026-07-11.md`): tenant
isolation clean across all 45 tools, no metering double-charges. Fixed in the
same PR: SSRF guard on detect_tech (P1), honest `remember` failure reporting
(P1), https-only `recordingUrl` + render guard (P1), search_web no longer charges
a zero-result search, enrich_entity debits after persistence, get_contact payload
capped, readOnlyHint drift on two metered tools, input caps on all unbounded MCP
write params, entity `phone` exposed to create/update tools.
