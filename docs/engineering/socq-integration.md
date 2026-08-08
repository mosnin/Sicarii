# SocQ social integration

> Status: built 2026-08-07, env-gated on `SOCQ_API_KEY` and deliberately
> dormant. The procurement gate below must clear before the key is set in
> production.

## The rule that shapes the whole design: hydrate, never resolve

SocQ has **no identity resolution**. Machine-checked across all 102 endpoints:
no endpoint accepts an email, none accepts a company domain for social lookup,
and no response carries a confidence, match score or candidate list. Inputs
are exact URLs, exact handles, or free-text search.

Scalar's accuracy rule (never attach data for the wrong person) therefore
splits the integration into two code paths that do not share a write route:

- **Hydration** (`src/lib/social-hydrate.ts`): given a social URL that our
  existing resolution stack already verified (find_socials name+company rule,
  Explorium/Pipe0/Exa), fetch rich profile + posts into `SocialProfile` /
  `SocialPost`. Refuses unverified URLs; never guesses a URL from a name.
- **Discovery** (`src/lib/social-discover.ts`): keyword/community monitors
  land posts in `SocialOpportunity`, a review queue. A search result can NEVER
  create or update a Contact or Entity - there is nothing to threshold on, so
  attaching result[0] to a person is exactly the same-name-stranger bug. A
  human converts an opportunity, with an explicit verified identity, or it
  stays an opportunity. A test proves the discovery path has no write route to
  records.

Intent scoring (0-100 + one grounded line) is done in OUR LLM layer; SocQ
returns raw data only, no sentiment or intent of any kind.

## Scope honesty

- **No group discovery exists.** `facebook/group-posts` needs group URLs the
  operator already has; we cannot "find groups about X". UI and tool
  descriptions must not imply otherwise.
- **LinkedIn is URL-only** (4 endpoints, no search). SocQ adds nothing there
  unless a verified profile URL already exists.
- Genuinely differentiated vs our existing providers: Facebook Groups posts,
  Facebook events/reviews, the Facebook Ad Library, and cross-platform video
  transcription.

## Cost and reliability model

Everything is async (submit -> poll a task) and billed per result. So:
`SocqTask` tracks every submission with an idempotency key (a retry replays
instead of double-billing), `results_limit` is always pinned (a careless call
can burn thousands of credits at up to 2000 results), `credits_amount` is
reconciled back to our meter, and prices are read from the live catalog (ETag
cached), never hardcoded. Response payloads (`author`, `metrics`, `media`) are
unschematized and drift as SocQ rotates upstream scrapers: parsers are
defensive and the raw blob is kept on the row.

## OPEN QUESTIONS - procurement gate before production

SocQ's terms of service were unreachable during integration. Before
`SOCQ_API_KEY` is set in production, get in writing:

1. The right to STORE returned data indefinitely in customer-owned systems.
2. The right to make it available to our tenants (our model IS resale:
   enrichment persists into customer-owned, exportable CRMs).
3. A DPA naming SocQ as processor or independent controller, plus a deletion
   propagation path for GDPR Art. 17.
4. Real `author`/`metrics` field names: one paid test call per endpoint family
   from an unblocked network, since the schemas are not public.

Even with SocQ's blessing, we remain controller for what lands in tenants'
CRMs, and LinkedIn/Meta-sourced personal data carries its own regulatory
exposure. The egress guard's special-category ban applies to social payloads
like every other source.
