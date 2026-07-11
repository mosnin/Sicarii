# Scalar

The CRM your agents run. Next.js 16 (App Router), React 19, TypeScript,
Tailwind v4, Prisma on Supabase Postgres, Clerk auth, Stripe + x402 billing.
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

## Production requirements (founder actions)

- **Upstash Redis (required):** set `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`. Without them every rate limit is per-serverless-
  instance and bypassable across autoscaled instances; the app logs a SECURITY
  error once per instance until configured.
- `OAUTH_SIGNING_SECRET` (falls back to `CLERK_SECRET_KEY` with a warning).
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
  (including `STRIPE_PRICE_TEAM` for the team plan).
- Clerk: enable Organizations and subscribe the webhook to `organization.*`
  and `organizationMembership.*` events (Teams).
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
