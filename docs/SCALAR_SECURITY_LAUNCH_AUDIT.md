# Application Security Launch Audit

## Scope

- Repository or app: Scalar web, Scalar for Mac, and Scalar CLI
- Environment reviewed: local candidate based on `origin/codex/convex-auth-company-os`; current public production behavior from the prior live audit
- Audit mode: source review, local verification, and prior safe production probes
- Live external testing approved: safe read-only probes only
- Date: 2026-09-07
- Auditor: Codex

## App Profile

- Product type: agent-operated CRM and company intelligence SaaS with native and local-agent clients
- Stack: Next.js 16, React 19, Prisma, Postgres, Convex Auth, OAuth 2.1, MCP, SwiftUI, Sparkle 2.9.2, Node.js CLI
- Auth provider: Convex Auth for people; Scalar OAuth or per-user API keys for clients and agents
- Database and storage: Postgres for canonical product data; macOS Keychain for native client credentials
- Deployment host: Vercel for web; Developer ID distribution planned for Mac
- Third-party services: Convex, Supabase, Vercel, Stripe, Upstash, AI and enrichment providers, Sparkle release transport
- Data collected: account profile, companies, contacts, deals, communications, activity, agent memory, billing and operational metadata
- User roles: personal owner, workspace admin/member, OAuth client, API-key agent

## Launch Decision

- Decision: Block launch
- Highest unresolved severity: P1
- Reason: the public production site still serves the older Clerk release, the new Mac client is not at full web parity, and signed and notarized Mac update infrastructure has not been exercised end to end.

## Executive Summary

The candidate has a strong authentication and agent-access foundation: Convex Auth, hashed OAuth credentials, PKCE S256, rotating refresh tokens, resource-bound bearer access, Keychain storage, a sandboxed Mac client, and an MCP CLI bridge. The Mac and CLI clients share canonical web data instead of introducing local CRM databases. Launch remains blocked because the candidate is not the public production release, native feature parity is incomplete, production rate limiting and secrets require deployment verification, and Developer ID plus signed Sparkle distribution cannot be proven from source alone.

## Top Findings

| Severity | Finding | Affected asset | Status | Required action |
| --- | --- | --- | --- | --- |
| P1 | Public production still exposes Clerk instead of the candidate Convex Auth flow | Web authentication | Open | Promote the release SHA and repeat clean-account login, migration, logout, and recovery tests |
| P1 | Mac app has overview parity only, not the full web capability matrix | Scalar for Mac | Open | Implement and verify remaining CRM, discovery, radar, agent, billing, and settings flows |
| P1 | Signed update channel is configured but no Developer ID, notarized build, signed feed, or rollback evidence exists | Mac supply chain | Open | Produce a signed beta, notarize it, sign archive and feed, and run update plus rollback drills |
| P2 | Dynamic client registrations have no automated expiry or cleanup | OAuth database | Open | Prefer a fixed first-party client or expire never-used registrations |
| P2 | Full production observability and alert drills are unverified | Operations | Unverified | Verify redacted logs, alarms, replay alerts, cost alerts, and runbooks |
| P2 | Full Mac UI testing and accessibility coverage do not exist | Scalar for Mac | Open | Add model, network, UI, VoiceOver, keyboard, light, and dark tests |

## Checklist Coverage

| Category | Status | Evidence |
| --- | --- | --- |
| Data and legal handling | Partial | Privacy, terms, acceptable use, and security pages exist; deletion workflow requires production proof |
| Asset inventory | Pass | Web, OAuth, MCP, Mac, CLI, update, database, and third-party boundaries are documented |
| Authentication | Partial | Candidate Convex Auth and OAuth controls exist; production remains on Clerk |
| Authorization and tenancy | Partial | Server operations are user scoped and OAuth resources are bound; full client API matrix is incomplete |
| Database and storage | Partial | Canonical Postgres and hashed OAuth storage are established; backup restore evidence is unverified |
| Input validation and injection | Partial | OAuth validation and tool schemas are present; complete route fuzzing is unverified |
| Output shaping and data leaks | Partial | Client overview is allowlisted and no-store; full response inventory is unverified |
| Secrets and configuration | Partial | No secrets were added; deployment secret separation and rotation remain unverified |
| Errors, logging, and monitoring | Partial | Error paths avoid token printing; production alerts and redaction review are unverified |
| Browser, headers, CORS, and CSRF | Partial | Native login uses the system browser; full production header scan remains unverified |
| Abuse, bot, and cost controls | Partial | Candidate rate limits fail closed in production; Upstash and alert behavior require live proof |
| Dependency and supply chain | Partial | Web high and critical audit findings were removed; Mac signing chain is not yet exercised |
| Payments, webhooks, and email | Partial | Existing signature and human approval gates have tests; live provider failure drills are unverified |
| File uploads and user-generated content | Partial | Existing upload constraints were reviewed previously; malware and content operations need live evidence |
| AI, LLM, and agentic features | Partial | MCP scopes, tenant context, cost controls, and approval gates exist; adversarial agent testing remains open |
| Deployment and release operations | Fail | Candidate is not production and Mac notarized update delivery is not proven |

## Detailed Findings

### P1 - Production identity is not the candidate identity

- Status: Open
- Confidence: High
- Affected asset: public Scalar authentication
- Evidence: the 2026-09-07 production health response reports Clerk auth, and `/api/client/v1/overview` redirects to browser sign-in instead of returning a bearer protocol error
- Impact: production cannot be declared migrated or used to validate Mac and CLI login
- Safe reproduction or reasoning: open the production sign-in route in a clean browser and inspect the provider screen
- Remediation: deploy the candidate with complete Convex, OAuth, database, rate-limit, and secret configuration
- Validation: sign up, sign in, migrate an existing verified email, authorize clients, refresh, revoke, log out, and recover on production

### P1 - Mac feature parity is incomplete

- Status: Open
- Confidence: High
- Affected asset: Scalar for Mac
- Evidence: the current SwiftUI client implements login, live overview, refresh, recent activity, sign out, and canonical web links
- Impact: it does not yet meet the requested same-functionality release promise
- Safe reproduction or reasoning: compare the Mac routes and controls with the complete web navigation and capability inventory
- Remediation: create versioned client endpoints and native views for each approved capability, reusing shared brand and interaction contracts
- Validation: capability matrix at 100 percent plus automated and manual parity tests

### P1 - Mac update trust chain is unproven

- Status: Open
- Confidence: High
- Affected asset: Scalar Mac distribution
- Evidence: release configuration requires Sparkle 2.9.2, signed feed, pre-extraction verification, Developer ID, notarization, and stapling, but release credentials and artifacts are not available locally
- Impact: shipping without this evidence risks install failure or update compromise
- Safe reproduction or reasoning: the packaging script stops when signing, update, or notarization inputs are absent
- Remediation: generate and protect the Sparkle key, configure Developer ID and notary credentials in CI, publish only signed HTTPS artifacts and feeds
- Validation: Gatekeeper assessment, notarization log, stapler validation, update, downgrade refusal, key rotation, and rollback drill

### P2 - OAuth dynamic client lifecycle is incomplete

- Status: Open
- Confidence: Medium
- Affected asset: OAuth client registry
- Evidence: registration is rate limited and grants no access, but registrations have no automated cleanup policy
- Impact: database growth and stale client metadata can accumulate
- Safe reproduction or reasoning: each CLI login currently registers a new public client
- Remediation: persist and reuse the first-party client identifier, pre-register first-party clients, or expire never-used clients
- Validation: lifecycle tests show bounded registry growth without breaking existing grants

## Auth Failure Case Results

| Case | Result | Evidence |
| --- | --- | --- |
| Wrong password repeated attempts | Unverified | Provider-side live behavior requires production Convex testing |
| Password reset for unknown email | Unverified | Current configured providers are OAuth-first; production recovery path requires validation |
| Verification or magic link reused | Not applicable | Candidate uses Google and GitHub OAuth providers |
| Duplicate signup | Partial | Verified-email linking and identity collision guards exist; live migration test remains |
| Protected route/API without session | Pass | OAuth client overview and MCP reject missing or invalid bearer credentials |

## Secrets And Data Exposure Review

- Frontend bundle exposure: no private OAuth or update signing key belongs in the client; the Sparkle public verification key is expected to be public
- API response exposure: overview returns allowlisted account metrics and recent activity only, scoped to the token account
- Logs and analytics exposure: CLI and Mac do not print access or refresh tokens; production log redaction remains unverified
- Environment variable exposure: CLI accepts an API key only from its process environment; release secrets are required outside source control
- Secret rotation needed: verify independent production values for Convex, OAuth consent, legacy MCP, Upstash, providers, webhooks, Developer ID, notarization, and Sparkle signing

## Infrastructure Abuse Controls

- Rate limits: OAuth register and token routes are rate limited; candidate production behavior fails closed when distributed limiting is unavailable
- Paid API caps: existing credits and approval paths constrain metered agent actions
- Usage alerts: unverified in production
- Bot protection: provider and endpoint rate limiting exist; signup abuse testing remains unverified
- Upload limits: existing web controls require a fresh production probe
- Queue/retry limits: bounded agent plans exist; live queue saturation and retry drills are unverified

## Validation Evidence

- Files inspected: OAuth server and routes, authentication helpers, MCP transport, overview builder, Prisma schema, design system, deployment and audit artifacts
- Commands run: focused Vitest, full Vitest, TypeScript no-emit check, direct Next build, Swift package build, dependency audit, lint, release-script refusal check, and production read-only probes across this and the immediately preceding audit pass
- Scanners reviewed: pnpm audit reports 0 critical, 0 high, 17 moderate, and 2 low findings after overrides
- Manual probes: production sign-in, protected endpoints, manifest, health, and deployment status; the latest health probe returned `ok: false`, Clerk auth, missing Upstash, and partial MCP OAuth configuration
- Tests run: 496 Vitest tests passed across 43 files; TypeScript passed; Next production build passed; Swift package build passed; ESLint returned 0 errors and 11 existing warnings
- Report validator: `validate_security_audit_report.py`

## Unverified Areas

- Real production Convex sign-in, account linking, recovery, revocation, and multi-workspace selection
- Full Mac capability parity, visual regression, accessibility, crash recovery, sleep and wake, offline behavior, and token revocation during use
- Developer ID identity, CI key custody, notarization, signed Sparkle feed, update archive, rollback, and staged rollout
- Production backup restore, logging redaction, alerts, incident response, data export, and deletion completion
- Clean-machine CLI installation and real local-agent interoperability across Codex, Claude, and generic MCP clients

## Remediation Plan

| Priority | Fix | Owner area | Validation |
| --- | --- | --- | --- |
| 1 | Promote Convex Auth and OAuth candidate to production | Web release | Clean-account and migrated-account end-to-end suite |
| 2 | Complete the Mac and web capability matrix | Product and Mac | Automated parity matrix plus visual QA |
| 3 | Stand up signed and notarized Sparkle release pipeline | Mac release | Install, update, rollback, and Gatekeeper evidence |
| 4 | Exercise CLI OAuth and MCP on a clean production account | CLI and agent platform | Login, refresh, logout, list, call, stdio smoke |
| 5 | Close production operations evidence | Security and operations | Restore drill, alert drill, log review, incident tabletop |

## Final Gate

- Remaining launch blockers: production auth mismatch, incomplete Mac parity, missing signed release evidence, and incomplete production operational verification
- Accepted residual risks: online-only clients and no offline write queue for the first release
- Recommended next verification: deploy the stacked candidate to an isolated production-like environment, run the complete web, Mac, CLI, auth, MCP, tenancy, and update matrix, then promote the same immutable SHA
