# Scalar Web, Mac, and CLI Platform Contract

Status: implementation foundation. Owner: Scalar. Last updated: 2026-09-07.

## 1. Component role

Scalar web is the canonical product, authorization server, policy engine, and data store. Scalar for Mac and the Scalar CLI are first-party clients. They never create a second CRM database and never own a second identity system.

The current Mac build is an authenticated native overview client. Full screen-by-screen parity with the web application remains a release gate, not a completed claim.

## 2. Inputs

| Client | Identity input | Data input | Local state |
| --- | --- | --- | --- |
| Web | Convex Auth session | Server-side Scalar operations | Browser session only |
| Mac | OAuth 2.1 authorization code with PKCE S256 | `/api/client/v1/*` bearer APIs | Rotating tokens in macOS Keychain |
| CLI | OAuth 2.1 loopback flow with PKCE S256, or `SCALAR_API_KEY` for headless use | Scalar MCP over streamable HTTP | Rotating tokens in macOS Keychain |

The Mac app uses `ASWebAuthenticationSession`, which opens a trusted system browser on macOS. Google login must not run inside `WKWebView` or another embedded user agent.

## 3. Outputs

- Web writes canonical product state to Postgres and owns all validation, tenancy, audit, cost, and action policy.
- Mac renders Scalar-branded state returned by the versioned client API and opens canonical web records for functions not yet native.
- CLI returns JSON for direct commands and exposes a local stdio MCP server through `scalar mcp serve`.
- Every Mac or CLI write must call an existing Scalar API or MCP tool. Local clients do not reconcile offline writes.

## 4. Validation and failure handling

- OAuth public clients have no client secret. PKCE S256, state, exact redirect matching, one-time codes, token hashing, refresh rotation, and replay-family revocation are mandatory.
- Mac access is bound to `https://www.tryscalar.xyz/api/client/v1/overview` and requires `crm:read`.
- CLI OAuth access is bound to `https://www.tryscalar.xyz/api/mcp/mcp` and requires `mcp`.
- Mac credentials use a `ThisDeviceOnly` Keychain accessibility class. CLI credentials use macOS Keychain and are passed to the Keychain command over stdin, not in process arguments.
- Access tokens are refreshed before expiry. A failed refresh signs the client out and requires a new browser grant.
- API responses use `Cache-Control: private, no-store`. The Mac client ignores the URL cache for authenticated data.
- Network cleartext is rejected except explicit localhost development for the CLI.
- The Mac app sandbox has only outbound network access. It has no file, camera, microphone, contacts, or broad automation entitlement.
- Agent writes remain subject to the same MCP confirmation and approval boundaries as remote agents.

## 5. Partner handoffs

| Owner | Required handoff | Acceptance evidence |
| --- | --- | --- |
| Web API | Add each Mac-native screen to `/api/client/v1/*` with resource and scope enforcement | Tenant isolation and auth failure tests |
| Web UI | Extract shared design tokens, copy, navigation labels, empty states, and interaction contracts | Visual parity review at light and dark appearances |
| Mac | Implement each remaining web capability against the client API | Automated UI tests plus signed beta QA |
| CLI | Package the executable and publish configuration examples for Codex, Claude, and generic MCP clients | Real OAuth and API-key smoke tests |
| Release | Developer ID sign, notarize, staple, and publish Sparkle 2.9.2 signed appcast and archive | Gatekeeper, Sparkle signature, downgrade, and rollback tests |
| Operations | Add auth, token replay, MCP, update, crash, and latency alerts without recording secrets | Alert drill and redacted log review |

## 6. Residual risk

- The Mac app currently exposes a live overview and canonical deep links, not full web feature parity.
- Production still needs the Convex Auth release promoted before either native client can complete real login.
- A Developer ID certificate, notarization profile, Sparkle Ed25519 key, signed appcast, and release host are external release inputs and are intentionally absent from source control.
- Offline mutation and conflict resolution are intentionally out of scope. Online-only canonical writes avoid split-brain CRM state.
- Dynamic client registration needs lifecycle cleanup or a fixed first-party registration before broad public release.

## CLI usage

```bash
pnpm scalar --help
pnpm scalar login
pnpm scalar status
pnpm scalar tools
pnpm scalar call search_crm '{"query":"Acme"}'
pnpm scalar mcp serve
```

For a headless agent, set `SCALAR_API_KEY` in the agent process environment and run `scalar mcp serve`. Never put the key directly in a committed configuration file.

## Production definition

Scalar is production ready only when all of these are true:

1. The Convex Auth web release is live and Clerk is absent from production behavior and deploy configuration.
2. Web CI, direct Next build, database migration, dependency scan, browser tests, tenancy tests, OAuth replay tests, and MCP smoke tests pass against the release SHA.
3. Mac covers the agreed web capability matrix, passes visual QA, is Developer ID signed and notarized, and accepts only signed Sparkle updates.
4. CLI install, OAuth login, refresh rotation, logout, JSON calls, and stdio MCP pass on a clean user account.
5. Production rate limiting, alerts, backup restore, incident response, rollback, privacy, terms, and data deletion have verified owners and evidence.

## Mac capability matrix

| Web capability | Mac status | Release requirement |
| --- | --- | --- |
| Sign in, token refresh, sign out | Implemented | Real production OAuth and revocation test |
| Dashboard overview and recent activity | Implemented | Visual, accessibility, and clean-account test |
| Open canonical Scalar records | Implemented | Same-origin deep-link test |
| Discover and match | Not implemented | Native workflow and client API |
| CRM list, map, create, edit, enrich, calls, and email | Not implemented | Native workflows and client APIs |
| Agent conversation and tool results | Not implemented | Streaming client API, approvals, and cancellation |
| Radar monitors and runs | Not implemented | Native workflow and client API |
| Field segments and pipelines | Not implemented | Native workflow and client API |
| Autopilot review and approval | Not implemented | Human-only approval UI and audit tests |
| Product context | Not implemented | Native editor and conflict-safe save API |
| Skills | Not implemented | Native catalog and safe install or copy behavior |
| Settings, workspaces, API keys, providers, and billing | Not implemented | Native workflows with step-up controls where required |
| Light and dark visual parity | Partial | Token extraction and screenshot regression suite |
| Signed automatic updates | Integrated, not released | Developer ID, notarization, signed feed, archive, and rollback proof |

## 7. Skill folder

`.agents/skills/bridge-integration-architect`
