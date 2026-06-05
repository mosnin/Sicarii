# AGENTS.md — working rules for this repo

## Icons — keep it tasteful

Do NOT use the "icon inside a tinted rounded box/circle" badge pattern (e.g. a
`bg-primary/10` rounded square wrapping a single lucide icon). It looks generic
and "vibe-coded." Use clean typography and layout instead; use icons sparingly
and only as functional affordances inside buttons, nav/dock items, and compact
list rows — never as decorative chips above headings or beside stats.

## Design system

Before building or restyling any UI, read `DESIGN.md` — the durable spec for the
Scalar aesthetic (baby-blue + white light-default color tokens, type, the
eyebrow/masthead/panel patterns, the animated ASCII field + its conventions,
motion/easing, mobile rules). Keep new work consistent with it; if you change a
token or pattern, update `DESIGN.md` too.

## This is NOT a vanilla Next.js app (Next 16, App Router)

Don't assume Next ≤14 APIs — verify against the installed version. In particular:
middleware is `src/proxy.ts` (not `middleware.ts`); dynamic route `params` are a
`Promise` (await them); theme-color comes from `export const viewport`; icons/manifest
use file conventions (`app/manifest.ts`, `app/apple-icon.tsx` via `next/og`).
The build runs `prisma db push` (schema auto-applies on deploy); to build locally
without the DB preflight use `./node_modules/.bin/next build`. Verify changes with
`./node_modules/.bin/eslint <files>` + a build before committing.
