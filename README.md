# Scalar

The CRM your agents run. Next.js 16 (App Router), React 19, TypeScript,
Tailwind v4, Prisma on Supabase Postgres, Convex Auth, Stripe + x402 billing.
Agents operate the CRM over MCP; deep context lives in `CLAUDE.md` and
`docs/README.md`.

## Local setup

```bash
cp .env.local.example .env.local   # fill in keys
pnpm install --no-frozen-lockfile
pnpm dev
```

- `pnpm build` runs `prisma db push` first: it connects to the database in
  `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` and applies the schema
  (additive; it refuses destructive changes without an explicit flag - never
  add `--accept-data-loss` casually).
- `pnpm lint`, `pnpm test` (vitest), `npx tsc --noEmit` before shipping.

## Environment doctor

This app has ~15 optional-but-load-bearing integrations, each gated behind an
env var, each failing differently when missing (some 501, some silently
no-op, some throw at request time). Run the doctor before you assume
something is broken:

```bash
pnpm run doctor   # note: `pnpm doctor` (no `run`) invokes pnpm's own
                  # built-in doctor command instead, not this script
```

It reports PASS / MISSING / PARTIAL per integration, grouped the same way as
`.env.local.example` (Auth, Database, Discovery providers, Enrichment
providers, Agent runtime, Billing, Rate limiting, MCP auth), and ends with a
summary count. It never prints secret values, only which env var names are
set.

The same report is available as JSON at `/api/health` (public, no auth) so it
can be curled after a deploy with no shell access to the server:

```bash
curl https://<your-deployment>/api/health
```

Both the CLI and the route read the same check logic from
`src/lib/env-doctor.ts`, so they can't drift apart.

## Production requirements (founder actions)

- **Upstash Redis (required):** set `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`. Without them every rate limit is per-serverless-
  instance and bypassable across autoscaled instances; the app logs a SECURITY
  error once per instance until configured.
- `MCP_OAUTH_SECRET` and a distinct `OAUTH_CONSENT_SECRET`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
  (including `STRIPE_PRICE_TEAM` for the team plan).
- Convex: link a deployment and configure Google and GitHub OAuth providers.
- Teams: keep workspace membership in the Scalar database and verify it on
  every workspace switch.
- Supabase: run `prisma/supabase-setup.sql` section 4 (pgvector HNSW index)
  once in the SQL editor; `db push` cannot create it.

## MCP

The agent-facing server is `/api/mcp/mcp` (streamable HTTP; SSE at
`/api/mcp/sse`), authenticated with per-user API keys (`scl_...`, minted in
Settings) or OAuth. The tool contract is documented in
`plugins/scalar/skills/scalar-mcp-agent/SKILL.md`.

Smoke-test a live server (proves list limits are enforced; the key is never
printed):

```bash
SCALAR_API_KEY=scl_... pnpm smoke:mcp                 # production endpoint
SCALAR_API_KEY=scl_... node scripts/mcp-smoke.mjs https://<preview>/api/mcp/mcp
```

## Scalar for Mac and CLI

The native Mac client lives in `apps/macos`. It uses the system browser for
OAuth PKCE, stores rotating credentials in macOS Keychain, reads canonical
Scalar data from the versioned client API, and uses Sparkle 2.9.2 for signed
updates. It does not keep a second CRM database.

The local-agent CLI is available as the `scalar` package binary:

```bash
pnpm scalar login
pnpm scalar status
pnpm scalar tools
pnpm scalar mcp serve
```

See `docs/SCALAR_PLATFORM.md` for the platform contract and explicit production
gates. The current Mac build is an authenticated overview foundation; full web
capability parity remains a release blocker.
