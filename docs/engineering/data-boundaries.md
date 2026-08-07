# Data boundaries

**Status:** shipped 2026-08-07. Enforced in code by `src/lib/egress.ts`.
**Agent-facing version:** `plugins/scalar/skills/scalar-data-boundaries/SKILL.md`.

Scalar is a multi-tenant CRM operated by AI agents, and it ships strings to a
long list of third parties on the operator's behalf. Until now there was no
written rule about what may leave a tenant, and no code enforcing one. This
document is the rule. `src/lib/egress.ts` is the enforcement.

## The principle

**The boundary is egress, not reading.**

Inside a tenant, the agent may read everything, and should. It is the operator's
own data, lawfully held, and a signature block or a thread reply is the best
evidence in the building. Restricting reads would make the product worse and
protect nobody.

Two things are different in kind, because they are not reversible:

1. **Egress.** A string sent to Exa, Tavily, Linkup, Firecrawl, Bright Data,
   Apify, or OpenAI has left our control. It is a transfer to a processor the
   data subject has never heard of.
2. **Writes onto a person's record.** A field on a contact persists, gets
   exported, gets read by whoever opens the record, and shows up in a subject
   access request.

So both are guarded, and reads are not.

## The legal reasoning

Three separate obligations, none of which we can meet by intention alone.

**Purpose limitation and data minimisation (GDPR Art. 5(1)(b), 5(1)(c)).**
Customer data was collected for the operator's own business relationship. Pasting
a customer's email into a public web search is processing for a new purpose, with
a new recipient, for no gain over a derived question. It also fails minimisation:
the search never needed the customer's words, only the question they raise.

**Processors and international transfer (Art. 28, Ch. V).**
Every provider below is a sub-processor. Operators owe their customers an
accurate list, and several of these providers are outside the EEA. A guard that
keeps message bodies out of outbound queries meaningfully shrinks what those
transfers actually contain, and it is the difference between "we send search
terms" and "we may send anything the agent pasted", which is a sentence no
operator wants to write in their own privacy notice.

**Special categories (Art. 9) and criminal data (Art. 10).**
Processing health, political opinion, religious or philosophical belief, trade
union membership, sexual orientation or sex life, and racial or ethnic origin is
prohibited unless a narrow condition applies. Selling software is not one of
those conditions. Criminal convictions and offences (Art. 10) need an equivalent
basis we also do not have.

The practical version: a CRM that knows a customer's health status is a CRM
somebody has to explain. Not to a regulator first, to the customer, and to the
operator's own team the moment they open the record. There is no sales question
that data answers. We refuse the write regardless of which provider volunteered
it, because we cannot verify consent for a fact a third party guessed.

## The three egress rules

1. **A derived question, never pasted content.** Email headers, quoted replies,
   signature blocks, and pasted message bodies do not go out.
2. **No raw identifiers as search terms.** An email address or a phone number in
   a search string is a person's identifier handed to a search company for
   nothing. Names plus companies are fine, and are how enrichment already works.
3. **The minimum that answers the question.** Shorter queries are better searches
   anyway.

## What the code does

`src/lib/egress.ts` exports two guards, both pure, synchronous, dependency-free
apart from `OpError`, and cheap enough to call on every request.

### `assertNoCustomerText(query, context)`

Throws `EgressBlockedError` (a 400, so it is never confused with a provider
outage, which surfaces as a 502 or `"<provider> failed (<status>)"`) when an
outbound string carries the shape of pasted customer content. The detected
signals:

| Rule | Fires on |
|---|---|
| `email-header` | two or more `From:` / `To:` / `Subject:` / `Sent:` / `Date:` lines |
| `quoted-reply` | `On <date>, <name> wrote:`, an original/forwarded separator, or two or more `>` quoted lines |
| `signature-block` | a `--` separator, a mobile mail-client footer, or a sign-off followed by a name line |
| `embedded-email-address` | a raw address in the query |
| `embedded-phone-number` | a candidate number with 9 or more digits |
| `verbatim-quote` | a quoted span over 160 chars |
| `pasted-block` | 4 or more lines and 280 or more chars |
| `prose-block` | 5 or more sentences, 400 or more chars, and high function-word density |
| `over-length` | over 600 chars |

**The tuning tradeoff, stated honestly.** False positives are expensive: a broken
search is felt immediately by the operator and quietly trains people to route
around the guard, which is worse than the leak it prevented. So every threshold
is deliberately loose. This catches text that is obviously a pasted message and
lets borderline cases through. It is a tripwire on the careless path, not a DLP
system, and it must never be described as one. `tests/egress.test.ts` pins a
block of realistic legitimate queries drawn from the actual call sites, so a
future tightening cannot silently break real searches.

`redactForEgress(text)` exists for the caller who legitimately holds a message
and needs a derived string out of it: identifiers removed, quoted history and
signature dropped, newlines collapsed, capped at 240 chars. Its output always
passes the guard. It is a convenience, not a laundering step.

### `assertRecordable(field, value)`

Throws `SpecialCategoryError` (also a 400) when a value would put Article 9 or
Article 10 data onto a contact or entity record. It refuses on three signals:

- **field name** - a column called `health_status` is the disclosure, whatever
  it holds;
- **explicit term** - specific enough to refuse on sight ("chemotherapy",
  "criminal record", "union member");
- **personal context** - an ambiguous term with a personal marker within 70
  chars. This tier is what lets Scalar store "physical therapy clinic" as an
  industry, "regional credit union" as a company name, and "Union Square" as an
  address, while refusing "he is in therapy" and "is a union member".

`containsSpecialCategory(value)` is the non-throwing value-only check;
`inspectRecordable(field, value)` adds the field-name signal;
`filterRecordable(rows)` keeps the safe rows of a bulk write and reports which
fields were dropped, so one bad field does not lose a whole enrichment.

**Nothing sensitive is ever logged or returned.** Both guards return structured
results naming the rule or the category and the signal, never the matched term
and never the value. The error messages name the field and the category only.
`tests/egress.test.ts` asserts this directly against the error message, the
serialised error, and every log line written on the way out.

### Where the egress guard is wired

At the point where a caller-supplied string becomes a request to someone else's
API, so it fails closed before any network call and before any log line:

| File | Function | Call-site label |
|---|---|---|
| `src/lib/tavily.ts` | `tavilySearch` | `tavily.search` |
| `src/lib/exa.ts` | `exaIntentSearch` (also covers `exaDeepSearch`, `exaFindLinkedIn`) | `exa.search` |
| `src/lib/exa.ts` | `exaFindCompanies` | `exa.findCompanies` |
| `src/lib/exa.ts` | `exaResearchContacts` | `exa.researchContacts` |
| `src/lib/exa.ts` | `createExaMonitor` | `exa.createMonitor` |
| `src/lib/linkup.ts` | `search` (covers `linkupSearch` + `linkupDeepResearch`) | `linkup.search` |
| `src/lib/firecrawl.ts` | `firecrawlSearch` | `firecrawl.search` |
| `src/lib/brightdata.ts` | `googleSerp` | `brightdata.serp` |
| `src/lib/apify.ts` | `googleMapsLeads` (query and location) | `apify.googleMaps` |
| `src/lib/apify.ts` | `apifyGoogleSearch` | `apify.googleSearch` |

URL-taking functions (`tavilyExtract`, `tavilyCrawl`, `analyzeSite`, `scrapeUrl`,
`scrapeSiteContacts`) are not guarded: a URL is a public address, not customer
content, and it is already fenced by the SSRF guard in `src/lib/ssrf.ts`.

## Every third party Scalar sends data to

Enumerated from `src/lib/env-doctor.ts`, which is the single source of truth for
what is configured. Every one of these is a sub-processor an operator must be
able to name.

### Discovery providers (guarded by `assertNoCustomerText`)

| Provider | Env | Receives |
|---|---|---|
| Tavily | `TAVILY_API_KEY` | search queries; URLs to extract or crawl |
| Exa | `EXA_API_KEY` | search queries and discovery prompts; company names for contact research; standing monitor queries stored on Exa's side and re-run on a schedule |
| Apify | `APIFY_TOKEN` | Google Maps search terms and locations; Google search queries; URLs to scrape for contact details |
| Linkup | `LINKUP_API_KEY` | standard and deep research queries |
| Bright Data | `BRIGHT_DATA_API_KEY` | Google SERP queries; URLs to fetch through the Web Unlocker proxy network |

### Enrichment providers

| Provider | Env | Receives |
|---|---|---|
| Explorium | `EXPLORIUM_API_KEY` | company domain and name; person first name, last name, and company domain |
| Pipe0 | `PIPE0_API_KEY` | company and person identifiers, fanned out across 50+ downstream data providers |
| Firecrawl | `FIRECRAWL_API_KEY` | company URLs to crawl; search queries (guarded) |
| Companies House (UK) | `COMPANIES_HOUSE_API_KEY` | company names and registration numbers |
| GLEIF | none (public, CC0) | company names for LEI lookup |
| SEC EDGAR | none (`SEC_EDGAR_USER_AGENT` optional) | company names and CIKs |
| Anymailfinder | `ANYMAILFINDER_API_KEY` | person name and company domain |
| Findymail | `FINDYMAIL_API_KEY` | person name and company domain |
| Bouncer | `BOUNCER_API_KEY` | candidate email addresses, to verify deliverability |
| Clearbit logo CDN | none | company domain only, in an image URL rendered by the browser |
| OpenStreetMap Nominatim | none | addresses and coordinates, for geocoding |

### Agent runtime

| Provider | Env | Receives |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | agent conversation content including whatever CRM records the agent read into context; text embedded for vector memory; discovery goals for swarm angle derivation; result text for refinement and extraction |

OpenAI is the widest transfer in the product, because the agent's context is
whatever it just read. That is intrinsic to an agent-operated CRM and is not
something the egress guard can narrow. What it means in practice: OpenAI is the
sub-processor operators most need disclosed, and the model provider's own data
retention terms are load-bearing for Scalar's compliance story. Treat any change
of model provider as a privacy decision, not a procurement one.

### Communications

| Provider | Env | Receives |
|---|---|---|
| AgentMail | `AGENTMAIL_API_KEY` (per-user key stored in-app) | mailbox contents, outbound message bodies, recipient addresses |
| AgentPhone | per-user key stored in-app | phone numbers, call audio and transcripts, agent instructions |

These two are the exception that proves the rule: they receive full message
content because delivering the message IS the purpose. The egress guard does not
apply to them, and must not be extended to them.

### Infrastructure

| Provider | Env | Receives |
|---|---|---|
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | operator identity: email, name, org membership. Not customer records. |
| Supabase Postgres | `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` | everything. The system of record. |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate-limit keys derived from user and route ids. No record content. |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | operator billing identity and subscription state. Not customer records. |
| Coinbase CDP / x402 | `X402_PAY_TO`, `X402_NETWORK`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` | on-chain payment amounts and wallet addresses. No record content. |
| Inngest | `INNGEST_SIGNING_KEY` | scheduled job payloads: record ids and query strings, not record bodies. |
| Vercel | platform | request logs and traces for every route. |

## What is not covered, and is owed

Stated plainly so nobody mistakes this for more than it is.

- **The agent's own context to OpenAI is unguarded**, and structurally cannot be
  guarded without breaking the product. See above.
- **The egress guard is heuristic.** A determined caller can rephrase past it.
  It stops the careless path, which is where the real exposure lives.
- **Special-category detection is English-only and keyword-based.** It will miss
  other languages and euphemism. It is a backstop behind the rule in the skill,
  not a substitute for it.
- **Existing records are not retro-scanned.** `assertRecordable` guards new
  writes. A sweep of stored values is owed and is not built.
- **The guard is not yet wired into the record write path.** `assertRecordable`
  is exported and tested; the call sites are listed in the handover and the
  wiring is owed by whoever owns `crm-operations.ts` and the enrichment paths.
