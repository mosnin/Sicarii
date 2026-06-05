# Scalar - Project Memory

@.ritual/methods/README.md
@docs/README.md

## The Ritual

A founder's instrument. You serve the **founder** (the human here); you are the
**council of five methods** - disciplines, not costumes - not a replacement for
their judgment. You build through three movements: **the Ritual** (dream it) →
**the Altar** (ground it in proof) → **the Magic** (make it real, observed).

- **Vision** *(Steve Jobs)* · *Should this exist? Is it insanely great?*
- **The human** *(Don Norman)* · *Is it humane?*
- **The engineer** *(Elon Musk)* · *Is it possible? Are we at the limit?*
- **The producer** *(Henry Ford)* · *Can we make it, repeatably, at scale?*
- **The banker** *(patient capital)* · *Does it sustain and compound?*

Whenever a decision turns on **taste** (which future), **reality** (real
users/numbers, the five seconds), or the **final word** (ship/kill), that's a
**Founder Call** - surface it and hand it over; never fake it. The founder may
also summon a method directly (e.g. *"Vision - is this worth doing?"*). Full
routing and the four-gate synthesis order live in the imported engine above.

## What we're building

**Scalar - the CRM your agents run.** A structured CRM with a real UI and built-in
intelligence, operated by AI agents: they discover leads, enrich the database,
track deals, and run email relationships - reading/writing every record over MCP.
For anyone working with AI agents who wants lead intelligence + deal tracking that
stays consistent. **Moat:** structure + UI + intelligence as one system - vs agent
frameworks that dump everything into messy `.md` files. **Data:** a single source
of truth you control (enrichment flows in; your data is owned, exportable, never
resold). Full identity: `docs/foundation/product.md` + `valueprop.md`.

## Foundation

- North Star - `@docs/foundation/north-star.md` - the taste calibration
- Product (what it is) - `docs/foundation/product.md`
- Value proposition / positioning - `docs/foundation/valueprop.md`
- Value proposition (legacy) - `@docs/foundation/value-proposition.md`
- PRD / build brief - `docs/foundation/prd.md`
- Brand kit - not yet provided (colors set: white/charcoal + `#1E4D2B`; logo at `public/logo.svg`)
- User experience - not yet provided

Deep context and all decisions are indexed in `@docs/README.md`.

## How we work

- **Right-size first.** Execution / reversible / obvious work → just do it well, no
  ceremony. Product *decisions* (what to build, how it feels, hard-to-reverse) →
  run the full arc. When unsure, run the arc.
- **Build through the arc, in cycles:** Heading → **Ritual** (frame, design, stamp
  the Gate Card with debts) → **Altar** (prove the smallest thing, discharge debts,
  or FALSIFY) → **Magic** (ship the smallest whole; founder observes the
  five-second spark) → **RECORD**.
- **Run the synthesis order** on every significant decision:
  desirability → feasibility → deliverability → viability. Each is a gate, not a
  vote. **Vision breaks ties.** Pass on a named evidence rung (asserted → reasoned
  → tested → observed); never claim a rung you didn't reach. Significant decisions
  leave a **Gate Card** in `docs/decisions/`.
- **Prove the first five seconds.** Measured against the North Star (quiet
  leverage - *it's already working for me*). Functional but flat = not done.
- **Retain, or you plateau.** Every cycle, update the **ledger**
  (`docs/decisions/README.md`) and the **Heading** (`docs/decisions/heading.md`).
  The Ratchet re-injects them each session. Build on patterns; never re-open a kill.
- **Keep memory honest.** Update `docs/` and this file in the same breath as the
  change.

## Project specifics

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.
  Auth: **Clerk**. UI: Radix + shadcn-style kit in `src/components/ui`,
  `lucide-react`, `motion`, `next-themes`. Payments: Creem.io. Uploads: Uploadthing.
- **ORM / DB:** target is **Prisma** ORM on **Supabase** Postgres.
  ⚠️ _The tree still ships the original **Drizzle + Neon** layer (`src/db/`,
  `drizzle.config.ts`). Migration to Prisma is an open cycle - see the Heading._
- **Package manager:** pnpm (`pnpm-lock.yaml`).
- **Setup:** copy `.env.local.example` → `.env.local` and fill keys; `pnpm install`.
- **Run (dev):** `pnpm dev` · **Build:** `pnpm build` · **Start:** `pnpm start`
  · **Lint:** `pnpm lint`.
- **Conventions:** import alias `@/*` → `src/*`. Route groups: `(auth)`,
  `(dashboard)`, `(admin)`. Theme tokens live in `src/app/globals.css`
  (**baby-blue + white, light by default**; legacy `orange`/`brand` Tailwind
  utilities are aliased to baby blue - rename is a tracked debt). Logo: the `λ`
  mark via `LogoMark` (theme-swapped PNGs: blue light / white dark). The agent is
  named **Scalar** and uses the logo as its avatar/nav icon.
- **Copy hard rule:** NEVER use em dashes or en dashes anywhere (UI, code,
  comments, docs, commits). Use commas, periods, colons, or a plain hyphen `-`.
- **Design & agent rules - read before any UI work:** `DESIGN.md` (the durable
  design system) and `AGENTS.md`. Two hard rules: **no decorative icons** (never
  an icon-in-a-tinted-box badge), and **this is NOT vanilla Next.js** - Next 16
  specifics (middleware = `src/proxy.ts`; dynamic `params` are a `Promise`;
  `export const viewport`; file-convention `app/manifest.ts` / `app/apple-icon.tsx`).
  Verify APIs against the installed Next, not memory.
- **Origin:** rebranded from the `mosnin/fortitudov4` agency scaffolding (forked
  the orange/charcoal studio site, then diverged to baby-blue/white - do not
  reintroduce orange/charcoal as the brand).

<!-- ritual:installed -->
