# Scalar — Design System

The durable spec for how Scalar looks and feels. Source of truth so the aesthetic
stays consistent across sessions and contributors. If you change a token or
pattern here, change it everywhere it's used — and update this file.

> Companion to `AGENTS.md`. The icon rule there is part of this system.
> ⚠️ We forked the orange/charcoal `fortitudov4` studio site and **deliberately
> diverged**. Scalar is **baby blue + white, light-default**. Do not reintroduce
> orange/charcoal as the brand.

---

## 1. Voice & posture

**The CRM your agents run** — a research & context platform. Calm, confident,
builder-not-funnel. Clean typography over ornamentation. The ASCII field is the
brand's soul: something quietly being assembled — "quiet leverage that feels
alive." Never "vibe-coded."

---

## 2. Color — baby blue is the only accent

Tokens live in `src/app/globals.css` (`:root` light / `.dark` dark, exposed via `@theme`):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#ffffff` | `#0A0A0A` | Page background (light is the default) |
| `--card` / `--popover` | `#ffffff` | `#141414` | Panels, cards |
| `--foreground` | `#1C1C1C` | `#F5F5F5` | Text |
| `--muted` / `--muted-foreground` | `#F5F5F5` / `#737373` | `#1C1C1C` / `#A3A3A3` | Subtle fills / secondary text |
| **`--primary`** | **`#5AB0E8`** | **`#5AB0E8`** | The accent — buttons, eyebrows, highlights |
| `--accent` | `#E6F3FC` | `#1C1C1C` | Tints |
| `--border` / `--input` | `#E5E5E5` | `#2A2A2A` | Borders |
| `--ring` | `#5AB0E8` | `#8FCCF2` | Focus rings |
| `--destructive` / `--success` / `--warning` | `#DC2626` / `#16A34A` / `#EAB308` | — | Status only — not decoration |

Rules:
- **Baby blue (`#5AB0E8`) is the single brand accent.** Don't introduce new accent
  hues unless asked. (The one sanctioned multi-hue is the ASCII gradient, §5.)
- **Legacy alias:** the `orange` / `brand` Tailwind utilities are remapped to baby
  blue — `--color-orange` `#8FCCF2` (light), `orange-dark` `#5AB0E8`, `--color-brand`
  `#5AB0E8` / light `#8FCCF2` / dark `#3A8FCC`. So `bg-orange hover:bg-orange-dark`
  = light-blue → primary. **Prefer `primary` in new code;** renaming `orange`→`brand`
  is a tracked debt. Don't add new literal orange hexes.
- charcoal scale for dark surfaces: `--color-charcoal` `#1C1C1C` / light `#2A2A2A` / dark `#0A0A0A`.
- Both light AND dark must read — never tune for one only. Default (unprefixed) = light; use `dark:` for per-theme surfaces.

---

## 3. Type

- **Headings / wordmark / big numerals:** `.font-brand` = `"Bitcount Grid Single"`
  (imported in `globals.css`).
- **Accent word:** wrap one word in `.text-gradient-orange` (a baby-blue gradient, bg-clip-text).
- **Body:** Inter (`font-sans`).
- **Eyebrow:** `text-xs uppercase tracking-[0.3em] text-primary`.
- **Logo:** `]s[` — `LogoMark` (`src/components/brand/logo-mark.tsx`) in `font-brand`,
  brackets `text-foreground/45`, `s` in `text-primary`. No image / `logo.svg`.

---

## 4. Reusable patterns

**Eyebrow**
```tsx
<p className="text-xs uppercase tracking-[0.3em] text-primary">Section</p>
```

**Heading with one accent word**
```tsx
<h2 className="font-brand text-3xl text-foreground sm:text-4xl">
  From idea to <span className="text-gradient-orange">launch</span>
</h2>
```

**Masthead / hero**
```tsx
<div className="relative overflow-hidden rounded-2xl bg-card p-6 sm:p-8 shadow-sm">
  <AsciiField className="absolute inset-0 h-full w-full opacity-30 dark:opacity-25" gradient />
  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(90,176,232,0.18),transparent_60%)]" />
  <div className="relative z-10">…</div>
</div>
```

**Panel / card** — `rounded-2xl bg-card shadow-sm` (± `border border-border`),
hover `hover:-translate-y-0.5 hover:shadow-md`. CRM rows are **borderless** (float
via shadow only). `GradientCard` for primary feature cards; `SpotlightCard` for secondary.

**Buttons** — base is **`rounded-full`** (`ui/button.tsx`). Primary `bg-primary
text-primary-foreground`; ghost/outline are transparent **with `backdrop-blur`**.
Panels use `rounded-2xl`/`rounded-3xl`; actions are pills.

**Stats** — `CountUp` (`ui/count-up.tsx`) tweens 0→value.

---

## 5. The ASCII signature

`AsciiField` (`src/components/dashboard/ascii-field.tsx`) — the *animated* canvas
field; background texture only. Ramp `" .·:-=+*≡#%@"`, ~30fps, honors
`prefers-reduced-motion` (one static frame).
- Props: `className, speed, cell, gradient`.
- `gradient` paints a flowing **blue→purple** palette (`#5AB0E8 → #5B8DEF → #7C77F0
  → #A78BFA`) — used on the logged-out hero / CTA / mobile menu.
- **Light mode needs higher container opacity** than feels intuitive (baby-blue on
  white is low-contrast): hero ≈ `opacity-30`, dark ≈ `opacity-25`; card accents lower.
- Used behind: hero, CTA, dashboard hero, preloader, launchpad, sidebar.
- If you add static hand-drawn ASCII illustrations: **box-drawing/geometric glyphs
  only — never emoji** (double-width, breaks monospace). Verify alignment in a terminal.

---

## 6. Motion (make it feel alive)

- Helper: `FloatIn` (`ui/float-in.tsx`) — opacity + y, stagger by index. Plus raw
  `motion/react` and `AnimatePresence mode="wait"` for stage/route transitions.
  `RotatingWord`, `ScrollProgress`, `DotFlow` for accents.
- Shared easing `[0.16, 1, 0.3, 1]`; springs ≈ `{ stiffness: 260, damping: 30 }`; durations 0.3–0.8s; calm.
- **Always** respect `prefers-reduced-motion` (`useReducedMotion`).
- **Avoid Framer shared-layout (`layoutId`) morphs between very different layouts**
  (e.g. horizontal dock ⇄ vertical sidebar) — they glitch. Prefer clean slide/fade.

---

## 7. Icons (mirrors `AGENTS.md`)

- **No** "icon inside a tinted rounded box/circle" badge. No decorative icons above
  headings or beside stats.
- Icons only as functional affordances **inside** buttons, nav/dock items, and
  compact list rows (send, stop, close, trash, copy, eye, plus, back, theme toggle).

---

## 8. Layout & mobile

- Container: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` (marketing prose `max-w-5xl/6xl`).
- Section spacing `py-20 sm:py-28`.
- **Theme:** light by default; dark via the header/sidebar toggle (`next-themes`, class strategy).
- **Horizontal lock:** `html`/`body { overflow-x: clip }`. No full-bleed child wider than the viewport.

### Dashboard shell — `src/components/dashboard/dashboard-shell.tsx`
The signed-in shell owns navigation in three modes, persisted to `localStorage`
(`scalar-nav-mode`); `lg` breakpoint = 1024px. Constants: `SIDEBAR_WIDTH = 224`,
`SIDEBAR_INSET = 252` (224 + 12 gutter + 16), `MORPH_SPRING`/`INSET_SPRING` ≈
`{ stiffness: 260, damping: 30–32 }`.

- **Dock (desktop default):** a floating pill — `fixed bottom-5 left-1/2
  -translate-x-1/2 z-50 hidden lg:block`; inner `flex items-end gap-2 rounded-full
  border border-border/60 bg-background/80 shadow-xl backdrop-blur-2xl` (dark:
  `border-white/10 bg-charcoal/80`). Apple-style **magnify** on hover (icon box 46→78px,
  influence radius 130px); **gentler on touch** (`pointer: coarse` → max 52px, softer
  spring). Items: Home · Discover · CRM · Agent (accent) · Context, a divider, the Apps
  launcher, then the sidebar toggle (`PanelLeft`).
- **Sidebar (desktop, toggled):** a **floating panel** — `fixed inset-y-3 left-3 z-50
  flex flex-col overflow-hidden rounded-2xl border border-border bg-background/95
  shadow-xl backdrop-blur-2xl` (dark: `border-white/10 bg-charcoal/95`), `width: 224px`,
  detached on all sides (12px gutters) so it floats like the cards. A subtle animated
  `AsciiField` sits behind the nav (`opacity-[0.18] dark:opacity-40`; content `relative
  z-10`). Header: `]s[` LogoMark + "Scalar". Nav rows `rounded-lg px-3 py-2.5 text-sm
  font-medium`; active `bg-primary/10 text-primary` (accent item `bg-orange/10
  text-orange`) with a trailing `bg-primary` dot. Footer: Apps, Collapse
  (`PanelLeftClose` → back to dock), and `UserButton` + `ThemeToggle`. Enters with a
  clean slide (`x: -(224+24) → 0` + opacity) and staggered items — **not** a shared-layout
  `layoutId` morph (those glitched; see §6).
- **Content inset:** `<main>` springs `paddingLeft` `0 → 252` when the sidebar opens,
  but the inner column stays `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` so content
  **keeps its size and just re-centers** (never stretches to full-bleed). The floating
  top header is taken out of flow in sidebar mode (no dead gap at the top).
- **Mobile (`< lg`):** no dock — a small launcher pill (`fixed bottom-6 left-3`) opens a
  slide-in nav panel (spring from `x: -100%`, with backdrop); opening it **minimizes the
  agent chat input** via `MobileNavContext`. The desktop dock/sidebar never render on mobile.
- **Launchpad ("Apps"):** a full-screen overlay — scrollable, themed with semantic
  tokens (correct in light **and** dark) — of nav tiles.

---

## 9. Engineering spine (so design survives reality)

- **Next 16, not vanilla:** middleware is `src/proxy.ts` (wraps `clerkMiddleware`);
  dynamic params are `Promise` (`await params`); `export const viewport` for
  theme-color; file-convention `app/manifest.ts` + `app/apple-icon.tsx` (PNG via
  `next/og` `ImageResponse`). Verify APIs against installed Next; don't assume ≤14.
- **DB:** Prisma on Supabase. Datasource reads the **Supabase Vercel integration**
  names — `POSTGRES_PRISMA_URL` (pooled) + `POSTGRES_URL_NON_POOLING` (direct) — not a
  custom `DATABASE_URL`. Build runs `prisma db push` (schema auto-applies on deploy);
  prefer additive/idempotent schema changes.
- **Auth:** Clerk via `proxy.ts`; the DB `User` row **auto-provisions** on first
  authenticated request (`getDbUser` / `getAuthenticatedUser`) — no hard webhook
  dependency. Roles `member` / `team` / `admin`; `isStaff = admin || team`.
- **CSP** (`next.config.ts`) must whitelist the production Clerk Frontend API
  (`*.tryscalar.xyz`) + Cloudflare Turnstile, or the sign-in/up widget renders blank.
- **Degrade gracefully:** optional integrations (Synthoz, Tavily, OpenAI, AgentMail)
  must no-op cleanly when their env keys are unset.
- **Per-user settings** on `User`: `productContext` (injected into the agent's system
  prompt) and `agentMailApiKey` (stored, shown masked in Settings).
- **Verify before commit:** `./node_modules/.bin/eslint <files>` and
  `./node_modules/.bin/next build` (plain `pnpm build` runs a DB push preflight).
