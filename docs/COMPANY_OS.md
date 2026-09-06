# Company OS app integration

Scalar is a data application connected to Company OS through OAuth 2.1. Company OS owns orchestration, permissions, scheduling and actions. Scalar remains the source of truth for its CRM and exposes only the account data approved by the person connecting it.

## Discovery

Company OS starts at:

```text
GET https://tryscalar.xyz/.well-known/company-os-app
```

The manifest identifies the authorization server, the protected overview resource and the Scalar deep link.

## Secure connection

1. Register a public client at `POST /oauth/register` with an exact Company OS callback URI and the scopes `openid profile company-os:overview`.
2. Generate a fresh PKCE verifier and S256 challenge for every authorization attempt.
3. Send the user to `/oauth/authorize` with `response_type=code`, the registered client id, exact callback URI, PKCE challenge, a random state value and `resource=https://tryscalar.xyz/api/company-os/overview`.
4. Verify state at the Company OS callback before exchanging the single-use code at `/oauth/token`.
5. Store access and refresh tokens in the Company OS server credential store. Never expose them to browser JavaScript or logs.
6. Rotate refresh tokens on every use. Scalar revokes the full grant when a rotated token is replayed.

Scalar stores authorization codes and tokens only as SHA-256 hashes. Redirect URIs use exact matching. PKCE plain is rejected. The consent screen lets the user choose a personal account or a workspace they belong to, and every token is bound to that account.

## Embedded overview

Company OS calls:

```http
GET /api/company-os/overview
Authorization: Bearer sco_at_...
```

The response contains:

- Account identity and Scalar capability labels.
- Company, contact, enrichment, active conversation and Radar metrics.
- Replies, follow-ups and enrichment work that need attention.
- Recent activity with safe links to the related Scalar record.
- `Open in Scalar`, `Open CRM in Scalar` and `Open Radar in Scalar` actions.

The endpoint accepts `company-os:overview` or `crm:read`. A resource-bound token is rejected when it was issued for any other resource. All queries use the account id on the OAuth grant, never an id supplied by Company OS.

## Rendering rules for Company OS

Company OS may cache layout metadata, but it should not persist the overview response longer than needed to render the connected app surface. Respect `Cache-Control: private, no-store`. Treat action URLs as external application links and show the label from the response. Opening the URL returns the user to the corresponding authenticated Scalar screen.

Scalar does not grant Company OS write access through the overview scope. Any future write capability needs a separate scope, separate consent text, server-side authorization checks and a documented rollback path.
