---
name: scalar-mcp-agent
description: Drive Scalar's CRM from an external agent via MCP - full tool contract, operating loop, and pitfalls.
---

# Connect your agent (MCP)

Scalar is the CRM your agents run. Point your agent at the MCP server and it
can operate the whole CRM: discover leads, enrich them, track outreach across
email, phone, and social, and pay for its own usage.

- Endpoint: `https://www.tryscalar.xyz/api/mcp/mcp` (streamable HTTP; SSE at `/api/mcp/sse`)
- Auth: `Authorization: Bearer scl_...` (mint a key in Settings) or OAuth (the
  server advertises `/.well-known/oauth-protected-resource`)
- 48 tools. Reads and CRM writes are free; only actions that pull outside data
  (discovery, enrichment, web search) cost credits, and a miss never charges.

## Teams and workspaces

A key minted while a team workspace is the active context is a WORKSPACE key:
every tool call reads and writes the shared team CRM and spends the team's
pooled credit meter, not the minting user's personal one. Multiple named keys
can operate one workspace concurrently (one per agent is the intended shape).
Writes made through `log_outreach` and `add_activity` are attributed to the
key (`actorId` / `actorLabel` on the activity), so the team can see which
agent did what. Only team admins can mint workspace keys.

## The operating loop

1. Orient: `get_balance` for runway, `recall` for past context (sessions are
   stateless - recall is your memory), then `search_crm` / `list_entities` /
   `list_contacts` before discovering, so you build on records instead of
   duplicating them.
2. Discover: `find_companies` (prompt to real companies, deduped, added as
   entities) or `maps_leads` (local businesses). `search_web` / `google_search`
   are read-only research, never a source of CRM records.
3. Enrich: `enrich_entity` (firmographics by domain, idempotent),
   `enrich_contact` (linkedin / email / phone, name-and-company verified),
   `find_socials` (social profiles, verified or returned as candidates),
   `verify_entity` (public registries, free), `detect_tech` (site stack, free).
4. Organize: `build_smart_segment`, `create_pipeline`, `add_to_pipeline`.
5. Track: after email, `save_email_context` + `log_outreach`; after a social
   DM, `log_social_message` (it advances pipeline state itself); after calls,
   `place_call` / `log_call` / `sync_call`. `list_due_followups` finds who to
   chase. `update_pipeline_entry` moves stages; set `conversationStatus` to
   CLOSED when a thread is done. `remember` anything worth keeping.
6. Measure: `pipeline_metrics`, then loop.

## List tools: exact contract

`list_entities` accepts:
- `query` (string, optional): filters name / domain / industry.
- `search` (string, optional): alias for `query` for older docs. If both are
  sent, `query` wins.
- `limit` (int 1-200, optional, default 50): rows returned, newest first.
No other params are read. The limit is enforced server-side.

`list_contacts` accepts:
- `query` / `search` (same alias rule): filters name / email / company.
- `status` (optional): one of NEW, ENRICHED, CONTACTED, REPLIED, QUALIFIED,
  WON, LOST, ARCHIVED. Unknown values are ignored, not an error.
- `limit` (int 1-200, optional, default 50).

List payloads omit the `enrichment` blob; fetch one record with `get_entity` /
`get_contact` when you need it (those include up to 50 recent emails and 50
social messages).

## Social tools

- `find_socials { contactId }`: web-searches for the contact's LinkedIn, X,
  Instagram, and Facebook profiles. AUTO-SAVES only profiles verified against
  the contact's name AND company; everything else returns as candidates with
  `nameMatch` / `companyMatch` flags - save one with `update_contact` only if
  you can confirm the person. 4 credits when anything is found; free on a miss.
- `log_social_message { contactId, channel, direction, body, threadRef?, sentAt?, savedAsContext? }`:
  records a DM / comment / connection note. `channel` is one of `linkedin`,
  `x`, `instagram`, `facebook`, `other`; `direction` is `INBOUND` or
  `OUTBOUND`. OUTBOUND stamps the outreach clock and advances NEW/ENRICHED to
  CONTACTED; INBOUND advances CONTACTED to REPLIED. Never downgrades.
- `list_social_messages { contactId, channel? }`: the conversation history,
  newest first.
- `create_contact` / `update_contact` carry `linkedin`, `facebook`,
  `instagram`, `twitter` (X profile URL or handle) directly.
- Source attribution: set `source` on `create_contact` to where you found the
  lead (`linkedin`, `x`, `instagram`, `facebook`, `referral`, `event`, ...).
  It defaults to `agent`; honest attribution is expected.

## Paying your own way

Metered tools gate up front and return a structured
`{"error": "insufficient_credits", "remedy": {...}}` when the meter is empty.
Do not stall: `buy_credits` (or `buy_plan` for sustained work; plans include
`team`) is a TWO-STEP x402 flow - call once with no `xPayment` to get a quote,
sign the USDC payment with your x402 client, call again with `xPayment` set,
then retry the call that failed. Idempotent on the on-chain nonce, so retries
never double-charge. `get_usage` is the price list.

## Pitfalls

- Sessions are stateless. `recall` before assuming you do not know something,
  and `remember` decisions worth keeping. If `remember` returns
  `remembered: false`, memory is unavailable - keep the context on the CRM
  record (notes / activity) instead.
- Enrichment accuracy is non-negotiable: a same-name stranger is never an
  acceptable result. Every enrichment path verifies name AND company; prefer
  null over a wrong value, and do the same with `find_socials` candidates.
- `extract_contact_details` returns raw site contacts for review; it never
  auto-creates records. Save selectively with `create_contact`.
- Always `log_outreach` (or `log_social_message`) after outbound touches; it
  is what makes `list_due_followups` reliable.
- `enrich_entity` is idempotent (re-enriching an enriched entity is free);
  most discovery tools charge only when they return results.

## Guardrails (always)

- Confirm before sending email or other high-stakes actions.
- Deduplicate before creating records (one company per domain).
- Never fabricate data into the CRM; tools, not guesses.

## Webhooks

To get notified when scheduled tasks (intent monitors, research schedules)
finish, set the Agent notifications webhook in Settings; Scalar POSTs results
there so your agent can wake up and act.
