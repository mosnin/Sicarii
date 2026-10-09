# Scalar - Design System

The durable spec for how Scalar looks and feels. Source of truth so the aesthetic
stays consistent across sessions and contributors. If you change a token or
pattern here, change it everywhere it's used, and update this file.

> Companion to `AGENTS.md`. The icon rule there is part of this system.
> **Aesthetic reference: Twenty** (github.com/twentyhq/twenty, `packages/twenty-ui/src/theme`).
> Scalar takes Twenty's *structure and finish* (navigation drawer + bordered page
> panel, hairline borders over shadows, 4/8px radii, 13px app body, record
> tables, tags) but keeps **its own colors (baby blue `#5AB0E8` + white /
> charcoal), Space Grotesk headings, and the ASCII signature** (founder call,
> 2026-10-09). The Home dashboard keeps its bento layout. Do not reintroduce
> orange/charcoal as the brand, and do not swap in Twenty's gray/blue palette.

---

## 1. Voice & posture

**The CRM your agents run.** Calm, dense, tool-like. The UI should feel like a
serious CRM you live in all day: quiet gray chrome, white work surface, data in
tables, color only where it means something (status, the one primary action).
Never "vibe-coded": no glows, gradients, hover lifts, or decorative icons.

---

## 2. Color - baby blue is the only accent

Tokens live in `src/app/globals.css` (`:root` light / `.dark` dark, exposed via `@theme`).

| Token (Tailwind) | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg-background` | `#ffffff` | `#0A0A0A` | Work surface (page panel) |
| `bg-card` / `bg-popover` | `#ffffff` | `#141414` | Panels, menus |
| `bg-surface` | `#FAFAFA` | `#111111` | App chrome: drawer, outer frame, row hover |
| `bg-surface-2` / `-3` | `#F5F5F5` / `#EBEBEB` | `#1C1C1C` / `#2A2A2A` | Gray fills, record chips |
| `bg-hover` / `bg-pressed` | 4% / 7% charcoal | 5% / 9% white | Hover / selected rows, tabs, nav |
| `text-foreground` | `#1C1C1C` | `#F5F5F5` | Primary text |
| `text-fg-secondary` / `-tertiary` / `-light` | `#525252` / `#737373` / `#A3A3A3` | `#D4D4D4` / `#A3A3A3` / `#737373` | Secondary text, labels, placeholders |
| `border-border` / `-strong` / `-light` | `#E5E5E5` / `#D4D4D4` / `#F0F0F0` | `#2A2A2A` / `#3A3A3A` / `#1C1C1C` | Hairlines |
| **`primary`** | **`#5AB0E8`** | **`#5AB0E8`** | The accent |
| `accent` / `bg-primary-soft` | `#E6F3FC` | `#1C1C1C` / `#0F2A3D` | Tints |
| `tag-{blue,green,red,orange,purple,gray}` (+ `-bg`) | | | Status tags (`Badge`) |
| `destructive` / `success` / `warning` | `#DC2626` / `#16A34A` / `#EAB308` | same | Status only |

Rules:
- **Baby blue is the only accent.** Everything else is neutral; status color comes
  from the tag palette via `Badge`. The sanctioned multi-hue is the ASCII gradient (section 5).
- **Hairlines over shadows** (Twenty). In-page surfaces get `border border-border`;
  shadows (`shadow-lg`, `shadow-2xl`) only on floating layers: menus, popovers,
  modals, toasts, the island. The brand CTA (`variant="glow"`) keeps a soft glow.
- Legacy aliases: `orange` / `brand` utilities = baby blue (`orange` `#8FCCF2`,
  `orange-dark` `#5AB0E8`); `charcoal*` = `#1C1C1C` / `#2A2A2A` / `#0A0A0A`.
- Both light AND dark must read. Default (unprefixed) = light.

---

## 3. Type

- **Headings / wordmark / big numerals:** `.font-brand` = Space Grotesk. Body:
  Inter. Mono: DM Mono. All loaded in `globals.css`.
- **Accent word:** `.text-gradient-orange` (baby-blue gradient, bg-clip-text).
- **App scale:** any page that mounts `.app-shell` (dashboard shell, auth, OAuth
  consent) re-tunes the Tailwind ramp to Twenty's 13px body via `:root:has(.app-shell)`:
  `text-xs` 11 · `text-sm` 13 · `text-base` 14 · `text-lg` 16 · `text-xl` 18 ·
  `text-2xl` 20 · `text-3xl` 24. `text-sm` is the default body size in the app.
  Marketing pages keep the stock ramp.
- Weights: 400 body, 500 labels/nav/buttons, 600 headings. No 700+ in the app.
- **Section label:** `.twenty-label` (11px, medium, tertiary gray). Replaces the
  old tracked-uppercase eyebrow inside the app.
- **Logo:** the `λ` mark via `LogoMark` (theme-swapped PNGs), shown in a 20px
  bordered tile in the drawer header.

---

## 4. Reusable patterns

**Radius:** `rounded-[4px]` for controls, chips, rows, buttons, inputs;
`rounded-[8px]` for panels, cards, popovers, modals. `rounded-full` only for
avatars (people), dots, spinners, progress, switches. (The global radius scale is
also shrunk, so legacy `rounded-2xl` lands near 8px.)

**Page header**
```tsx
<h1 className="text-2xl font-semibold text-foreground">CRM</h1>
<p className="mt-1 text-sm text-fg-tertiary">One-line description.</p>
```

**Panel (Twenty show-page card)**
```tsx
<section className="rounded-[8px] border border-border bg-background">
  <header className="flex h-10 items-center justify-between border-b border-border px-3">
    <h2 className="text-sm font-medium">Title</h2>
  </header>
  <div className="p-3">...</div>
</section>
```

**Record table:** `.twenty-table` (globals.css) inside `rounded-[8px] border
border-border overflow-x-auto`: 32px rows, hairline grid, tertiary-gray headers,
row hover `bg-surface`. Dense link lists use `divide-y divide-border` with h-10 rows.

**Record chip:** `inline-flex h-5 items-center gap-1 rounded-[4px] bg-surface-2
px-1.5 text-sm`, with a 14px avatar (companies square, people round).

**Tags:** `Badge` (`ui/badge.tsx`) is the Twenty tag: 20px, 4px radius, medium
weight, tinted by meaning (`primary`, `success`, `warning`, `destructive`, `secondary`).

**Buttons** (`ui/button.tsx`): 4px radius, 13px medium. `default` = blue accent
(one per surface), `outline` = Twenty "secondary" (the everyday bordered button),
`ghost` = Twenty "tertiary", `secondary` = gray fill. Sizes `sm` 28px, `default` 32px.
Focus = blue border + 3px soft blue halo.

**Inputs** (`ui/input.tsx`, `ui/textarea.tsx`): 32px, 4px radius, hairline that
darkens on hover, blue border + halo on focus.

**Tabs:** underline tabs, `border-b-2 border-foreground` when active, counts in
`text-fg-light`.

**Stats:** `twenty-label` caption over `text-xl font-semibold tabular-nums` in a
bordered panel. `CountUp` (`ui/count-up.tsx`) still tweens the number.

---

## 5. The ASCII signature

`AsciiField` (`src/components/dashboard/ascii-field.tsx`) is the brand's soul:
the animated canvas field, background texture only (ramp `" .·:-=+*≡#%@"`,
~30fps, one static frame under reduced motion). `gradient` paints the blue to
purple palette (`#5AB0E8 → #5B8DEF → #7C77F0 → #A78BFA`). Used behind: the
navigation drawer (whisper, `opacity-[0.14]`), the Home bento hero, preloader,
welcome, auth, and the marketing hero/CTA. Light mode needs higher opacity than
feels intuitive. Static ASCII art: box-drawing/geometric glyphs only, never emoji.

## 6. Motion (quick and quiet)

- Helper: `FloatIn` (`ui/float-in.tsx`) - opacity + 4px y over 0.25s, stagger by index. Plus raw
  `motion/react` and `AnimatePresence mode="wait"` for stage/route transitions.
  `RotatingWord`, `ScrollProgress`, `DotFlow` for accents.
- Shared easing `[0.16, 1, 0.3, 1]`; springs ≈ `{ stiffness: 260, damping: 30 }`; app durations 0.1-0.25s (Twenty: instant 75ms, fast 150ms, normal 300ms); no hover lifts or scale.
- **Always** respect `prefers-reduced-motion` (`useReducedMotion`).
- **Avoid Framer shared-layout (`layoutId`) morphs between very different layouts**
  (e.g. horizontal dock ⇄ vertical sidebar) - they glitch. Prefer clean slide/fade.

### 6b. Motion Surfaces (do not regress)

Four adapted cult-ui primitives live in `src/components/ui/` and are part of the
product's felt experience. They are installed, themed to our tokens, and in
production use. Removing or downgrading them to static UI is a regression.

| Primitive | File | In production at | Use it for |
|---|---|---|---|
| **DynamicIsland** | `ui/dynamic-island.tsx` | `dashboard/agent-island.tsx`, mounted in the dashboard layout | Ambient status HUDs: state that should be one glance away, never a page. Compact by default, expands on tap, auto-tucks after 8s. |
| **MorphSurface** | `ui/morph-surface.tsx` | `crm/[id]/quick-note.tsx` (contact Activity card) | Inline capture: a one-line dock that morphs into a small form (notes, quick inputs). Submits via `onSubmit(FormData)`, success dot animates. |
| **ExpandableScreen** | `ui/expandable-screen.tsx` | `sections/product-demo.tsx` (homepage) | A card that morphs to a full-screen immersive layer. Mount heavy content (iframes, players) only inside the expanded state so triggers stay light. Pass `bgClassName` on the trigger matching the content bg for a clean morph. |
| **SidePanel** | `ui/side-panel.tsx` | `sections/manifesto-rail.tsx` (homepage) | An edge-anchored rail that stretches open across the page for a single held moment (a statement, a highlight). One per page, maximum. |

Rules:
- Theme through tokens only (`bg-card`, `bg-foreground`, `text-background`,
  `border-border`, `bg-primary`). Never reintroduce the upstream hardcoded
  neutrals/black.
- These are moments, not wallpaper: one island per app shell, one rail per page,
  morph surfaces only where capture beats navigation.
- Icon rules from section 7 still apply inside all four surfaces.

### 6c. Marketing effect kit (do not regress)

Registry components adapted for the marketing site, all tuned to the baby-blue
system. In production use:

| Effect | File | Where | Notes |
|---|---|---|---|
| **AgentCircuit** | `sections/agent-circuit.tsx` (wraps `ui/circuit-board.tsx`) | Homepage + `/product/how-it-works` | Scalar's real data flow as an animated circuit: agent, discover/radar, verify/enrich, CRM core, email/calls. Pulses in `#5AB0E8`. Scale-to-fit via `react-use-measure`. |
| **DotGridSpotlight** | `dot-grid-spotlight.tsx` | Problem section background | Cursor-lit dot field in primary blue at whisper opacity. Content stays `z-10`. |
| **ShimmeringText** | `shimmering-text.tsx` | CTA heading accent | Character shimmer from `--primary` to `--foreground`. Use on ONE phrase per page. |
| **Footer reveal** | pattern in `app/page.tsx` | Homepage | Content (`z-10`, opaque bg) slides up over the sticky footer (`sticky bottom-0 z-0`). Pure CSS. |
| **CompoundingSection** | `sections/compounding.tsx` (vendored chart engine) | Homepage | Single-series line chart of record growth + metric tiles, labeled "Illustrative view". Chart colors are the validated tokens: `--chart-1` is `#2E7DB3` light / `#3E96D6` dark (3:1+ contrast on both surfaces, dataviz-validated). One series, crosshair tooltip, recessive grid. |
| **Border2 corner ticks** | `pixel-perfect/border2.tsx` | Circuit + compounding containers, pricing "popular" card | Blueprint-style corner tick frame. Overlay inside a `relative` container; `pointer-events-none`. Use on technical/featured surfaces only. |
| **TextFlip** | `text-flip.tsx` | WhyScalar heading ("Scalar owns [structure / the UI / intelligence / all four]") | Cycles an array of children with a spring flip. Use on ONE phrase per section; pass `as={motion.span}` for inline headings. |
| **AspectView** | `dashboard/aspect-view.tsx` | Entity detail "Intelligence" bento grid | Turns raw enrichment blobs (firmographics/funding/tech/traffic/news) into stat tiles, chips, funding rounds, and news cards. Defensive deep-extraction + DataView fallback. |

A wider fleet (testimonials, logos carousel, metrics charts, text-flip,
carousels, gradient/blur backgrounds, shark form primitives) is installed and
compiling, staged for future waves - see the vendored ignore list in
`eslint.config.mjs`. Chart colors are theme tokens (`--chart-1..5`, baby-blue
ramp) - never orange.

Honesty rule for marketing sections: no fabricated testimonials, customer names,
or logos, ever. The testimonials and trusted-by sections ship only when the
founder supplies real quotes and real logo permissions. The AgentMarquee (real
MCP-client logos) is the only social-proof band until then.

---

## 7. Icons (mirrors `AGENTS.md`)

- **No** "icon inside a tinted rounded box/circle" badge. No decorative icons above
  headings or beside stats.
- Icons only as functional affordances **inside** buttons, nav/dock items, and
  compact list rows (send, stop, close, trash, copy, eye, plus, back, theme toggle).

---

## 8. Layout & mobile

- Marketing container: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`; sections `py-20 sm:py-28`.
- **Theme:** light by default; dark via the drawer/header toggle (`next-themes`, class strategy).
- **Horizontal lock:** `html`/`body { overflow-x: clip }`.

### Dashboard shell - `src/components/dashboard/dashboard-shell.tsx`
Twenty's frame in Scalar's colors. Root `div.app-shell` on `bg-surface`.

- **Navigation drawer (desktop, `lg`+):** 220px, no border, on the gray chrome, with a
  faint `AsciiField` behind it.
  Header: logo tile + "Scalar" + a collapse button revealed on hover; the Clerk
  `OrganizationSwitcher` below it. Sections with `twenty-label` headings
  ("Workspace", "Agent"); rows are `h-7 rounded-[4px] px-1.5 text-sm`, 16px icons
  at stroke 1.6, `text-fg-secondary`, hover `bg-hover`, active `bg-pressed
  font-medium text-foreground`. Footer: Apps (launchpad), Settings, then the
  account row (`UserButton showName` + `ThemeToggle`). Collapsing slides the
  drawer to 0 width; the choice persists in `localStorage` (`scalar-sidebar`:
  `open` | `closed`) and the top bar shows an expand button.
- **Page panel:** `bg-background`, `rounded-[8px] border border-border`, inset
  8px from the window edges, scrolling on its own (`lg:h-dvh` frame). A 40px top
  bar shows the breadcrumb (nav icon + section, then `/ Record`, `/ New`, etc.).
  Content column: `mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 pt-5`.
- **Mobile (< lg):** no drawer, the panel is full-bleed with window scroll. The
  top bar carries the logo, workspace switcher, theme toggle and account menu; a
  flat bottom tab bar (`bg-surface/95 border-t`) carries every nav item + Apps.
  `MobileNavContext` is still exported for the agent composer.
- **Launchpad ("Apps"):** a command-menu style modal (max-w-2xl, 8px radius,
  `shadow-2xl`, `bg-black/30` overlay): a numbered list of every area with its
  one-line description. Escape / overlay click closes it.


## 9. Engineering spine (so design survives reality)

- **Next 16, not vanilla:** middleware is `src/proxy.ts` (wraps `clerkMiddleware`);
  dynamic params are `Promise` (`await params`); `export const viewport` for
  theme-color; file-convention `app/manifest.ts` + `app/apple-icon.tsx` (PNG via
  `next/og` `ImageResponse`). Verify APIs against installed Next; don't assume ≤14.
- **DB:** Prisma on Supabase. Datasource reads the **Supabase Vercel integration**
  names - `POSTGRES_PRISMA_URL` (pooled) + `POSTGRES_URL_NON_POOLING` (direct) - not a
  custom `DATABASE_URL`. The build no longer pushes schema - run `pnpm db:deploy`
  deliberately before releasing a schema-dependent feature; prefer
  additive/idempotent schema changes.
- **Auth:** Clerk via `proxy.ts`; the DB `User` row **auto-provisions** on first
  authenticated request (`getDbUser` / `getAuthenticatedUser`) - no hard webhook
  dependency. Roles `member` / `team` / `admin`; `isStaff = admin || team`.
- **CSP** (`next.config.ts`) must whitelist the production Clerk Frontend API
  (`*.tryscalar.xyz`) + Cloudflare Turnstile, or the sign-in/up widget renders blank.
- **Degrade gracefully:** optional integrations (Synthoz, Tavily, OpenAI, AgentMail)
  must no-op cleanly when their env keys are unset.
- **Per-user settings** on `User`: `productContext` (injected into the agent's system
  prompt) and `agentMailApiKey` (stored, shown masked in Settings).
- **Verify before commit:** `./node_modules/.bin/eslint <files>` and
  `./node_modules/.bin/next build` (plain `pnpm build` runs a DB push preflight).
