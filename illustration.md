# Illustration System - Scalar's logged-out site

The Forge UI illustration library, what it's for, which pieces we've adopted,
and the contract that keeps a set of third-party illustrations reading as
Scalar rather than as a components bin.

Companion to `DESIGN.md`. Where the two disagree, **`DESIGN.md` wins.**

---

## 0 · The one rule

> **The theme is the constant. The illustration is the variable.**

Every illustration in this library arrives with someone else's design
opinions: `neutral-*` greys, purple and green accents, a stranger's icon pack,
demo names like "Ethan Parker". Adapting means **conforming the component to
`DESIGN.md`** - baby blue, semantic tokens, Lucide, Scalar's nouns.

It never means the reverse. No illustration, however good, is a reason to
introduce a new accent hue, a new icon family, a new radius, a new font, or a
new background treatment. If a component can't be made to fit the system, the
component loses.

Nothing in this file changes `globals.css`, the tokens, the type scale, the
header, the hero, or any existing section.

---

## 1 · What has shipped

Wave one: five product pages, one illustration each, in the slot directly
under the hero.

| Page | Illustration | Adapted from | The claim it proves |
|---|---|---|---|
| Home, the problem band | `ScatteredToTyped` | `recordimport` | The same research, written once, as a record you can use. |
| `/product/discover` | `DiscoverResearch` | `agentresearch` | You describe the market. The list builds itself. |
| `/product/enrich` | `EnrichScan` | `pagescan` | Every field filled, and you can see where it came from. |
| `/product/signals` | `SignalStack` | `notification-stack` | You hear about the budget before the market does. |
| `/product/agent` | `AgentHandoff` | `handoffmenu` | Your agent already knows how to use it. |
| `/product/why` | `OwnYourData` | `export-flow` | One place your agents can't outgrow, and you can walk away with. |
| `/product/how-it-works` | `RecordPipeline` | `data-pipeline` | Nothing reaches your CRM until it has been checked. |
| `/pricing` | `ThreeStepsLive` | `onboarding-steps` | You are four steps from a CRM that fills itself. |
| `/security` | `AuditTrail` | `timeline` | Every write is on the record, with the source attached. |

**One shared fiction.** The homepage capability panels already had a cast:
Northwind Pay, Ledgerline, Cedar Capital, enriched via Explorium / Exa / Pipe0.
Every illustration now uses that same cast, so the site tells one continuous
story instead of two. New illustrations conform to the homepage, never the
other way round.

Adapted components live in `src/components/marketing/illustrations/`.
Untouched vendor originals stay in `src/components/forgeui/` (§7).

**Integration surface - deliberately tiny.** `FeaturePage` gained one optional
prop, `illustration?: React.ReactNode`, rendered between the hero and the
blocks. Passing nothing renders nothing. That plus five one-prop additions is
the entire change to pre-existing code; no existing markup or styling moved.

**Verified:** `tsc --noEmit` clean, `eslint` clean, `next build` green, all
five pages still prerender static, and every illustration was screenshotted in
light **and** dark at 1280px before being called done.

### Deliberately left alone

- **`/product/how-it-works`** already carries `AgentCircuit`, which draws
  Scalar's real data flow. A second flow diagram would compete with it and
  win nothing. One illustration per page, and that page has its one.
- **The homepage.** Thirteen sections already, several with motion surfaces
  (`ProductDemo`, `ManifestoRail`, `CompoundingSection`, `AgentCircuit`).
  Adding illustrations there is stuffing, not filling. If the homepage gets
  one it should *replace* a section's visual, not append to it.
- **Header, hero, logo cloud, feature-section blocks.** The supplied block
  library (`header02/05`, `hero-section02/06/10/15`, `logo-cloud01/03`,
  `feature01-09`) is not adopted. Scalar already has all four, built to
  `DESIGN.md`. Swapping them is a theme change, which §0 forbids. They stay
  available for a page that has no equivalent yet, never as a replacement.

---

## 2 · The law

A visitor decides in about five seconds, and they scan the picture before they
read the headline. So the picture carries the argument.

**The three-layer rule.** Every illustrated section has exactly three layers:

| Layer | Carries | Rule |
|---|---|---|
| **Illustration** | The proof - you can *see* it happen | Shows the after-state, never the apparatus |
| **Claim** | The promise - what changes for you | A benefit sentence. Never a feature name |
| **Detail** | The mechanism, one line | Earned only after the promise has landed |

`IllustrationFrame` enforces the shape: it takes `claim` and optional
`detail`, and the illustration is its child.

**Show the after, not the apparatus.** This is the edit that mattered most in
wave one, twice:

- `pagescan` ends on a "Scanning page…" spinner. `EnrichScan` ends on the
  fields it produced, each with its source. Scanning is our problem; filled
  fields are the customer's benefit.
- `agentresearch` ends on two blog articles - the exact thing Discover
  promises never to return. `DiscoverResearch` ends on typed company records,
  one of them a dedupe skip.

**The inversion test.** Write the sentence the illustration makes a visitor
feel. If it describes the software, rewrite it to describe their day.

- ✗ "Multi-source enrichment with provenance tracking"
- ✓ "Every field filled, and you can see where it came from."

**Never fabricate proof.** `DESIGN.md`'s honesty rule extends here: no invented
customers, logos, testimonials or metrics. Company names inside illustrations
are **deliberately invented** (Ledgerline, Northbank Pay, Vaultpay) so nobody
reads them as customers. Every brand mark shown is a real, shipping
integration.

---

## 3 · Placement

### Density budget

| Page | Illustrations | Note |
|---|---|---|
| A product page | 1 | In the frame under the hero |
| Home | 0 new | Already at capacity - replace, don't append |
| Pricing | 0-1 | Only if it answers an objection |
| Integrations | 0 | `ConnectionDemo` already holds this slot |
| Security / legal | 0 | Prose pages. An illustration here reads as spin |

- **One claim, one illustration.** Two in a viewport compete; the visitor
  resolves it by scrolling past both.
- **Each must survive being seen alone.** People deep-link.
- **An illustration that repeats the section's copy is decoration.** Cut it.

### Slot vocabulary

`HERO-PROOF` (the frame under a hero) · `BEFORE` (the problem) · `TURN` (the
aha) · `PROOF` (numbers/results) · `TRUST` · `CLOSE`

---

## 4 · The adaptation contract

Every box ticked before an illustration is rendered on a page. This is what
"adapted to our product" means in practice - and it is entirely a matter of
bending the component toward `DESIGN.md`.

**Speak Scalar's nouns**
- [ ] Every visible string is Scalar's vocabulary. Zero vendor demo copy
- [ ] Company/person names are invented, never real businesses
- [ ] Every number is defensible or obviously illustrative
- [ ] Brand marks shown are real, shipping integrations only

**Wear Scalar's skin**
- [ ] **Never `bg-background` inside the frame.** In dark, `--background`
      (`#0A0A0A`) is *darker* than `--card` (`#141414`), so a panel on
      `bg-background` sits inside the frame as a heavier black than the card
      holding it, which nothing else in the UI does. Panels are `bg-card` with
      `border-border`; `bg-muted` is the raised/recessed fill. This shipped
      wrong across all nine illustrations once: check an illustration beside a
      native card, not on its own.
- [ ] No pure `white`/`black` gradient stops. Against a tinted card they read
      as a cream or charcoal band that exists nowhere in the system. Use
      `var(--card)`.
- [ ] No `neutral-*`, no `#hex`, no foreign accent. Semantic tokens only:
      `bg-card` `bg-background` `bg-muted` `text-foreground`
      `text-muted-foreground` `border-border` `text-primary` `bg-primary`
- [ ] Baby blue (`--primary`) is the only accent - §2 of `DESIGN.md`
- [ ] Correct in **light and dark**. Light is the default and the one stock
      components get wrong
- [ ] Radius and border weight match the surrounding cards
- [ ] Fades/masks use `var(--card)`, not `var(--color-white)`/`black` - an
      opaque white fade over a tinted panel reads as a broken blank box
      (this is exactly what happened to `export-flow`; see §7)

**Move like Scalar**
- [ ] Entry ≤ 400ms, shared easing `[0.16, 1, 0.3, 1]`, calm
- [ ] `prefers-reduced-motion` renders the **final** state - not a slower one.
      Vendor components ship raw CSS keyframes with no such guard; add the
      `@media (prefers-reduced-motion: reduce)` block yourself
- [ ] Looping animation is capped, not infinite ambient churn

**Behave**
- [ ] Decorative wrapper is `aria-hidden` - the claim is the content
- [ ] No focusable elements inside
- [ ] Fits at 375px via `FitScale` (shrink to fit, never upscale, never
      overflow - the horizontal lock in `DESIGN.md` §8 has no tolerance)
- [ ] **Measure the content height.** Every vendor illustration is a
      fixed-size canvas; if content exceeds it, the payoff row gets clipped.
      Two of five were clipped on first render

---

## 5 · Icons

`DESIGN.md` §7 and `AGENTS.md` govern. In short:

- **Lucide is the icon library** (`components.json` → `"iconLibrary": "lucide"`).
- **No decorative icons.** No icon-in-a-tinted-box badges, none above
  headings, none beside stats. Icons are functional affordances only.
- **`react-icons` is a liability, not a license.** Sixteen of the 28 vendor
  components import it, pulling Feather/Heroicons/Font Awesome/Simple Icons -
  different grids and stroke weights next to Lucide, which reads as assembled
  from parts. Installed only because the vendored fleet compiles against it.
  **No adapted component imports it, and none should.** Re-point generic
  glyphs to Lucide, or inline a small SVG as `DiscoverResearch` does.
- **Brand marks come from our own files.** Scalar self-hosts agent logos in
  `public/agents/`, rendered monochrome
  (`[filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]`) so every
  mark reads in both themes. `AgentHandoff` uses those, which is why it shows
  the seven agents we actually support instead of the vendor's Cursor/Zed/
  Opencode list.

---

## 6 · Registry

Forge UI is a private registry, wired in `components.json`:

```json
"@forgeui": {
  "url": "https://forgeui.in/r/{name}.json",
  "headers": { "Authorization": "Bearer ${FORGEUI_API_TOKEN}" }
}
```

The token lives in `.env.local` as `FORGEUI_API_TOKEN` (git-ignored via
`.env*`). Install with `npx shadcn@latest add @forgeui/<name>`; components land
in `src/components/forgeui/`.

> **Rotate the token.** It was shared in plaintext chat. It is not stored in
> the repo, but treat it as compromised and replace it.

---

## 7 · The catalog - all 28

**Rendered and inspected, not read off the names.** An earlier version of this
table described several components from their filename and got them wrong. Every
"Actually shows" below was verified by mounting all 28 on a scratch route and
looking at them.

`★` = in production.

| # | Component | Export | Libs | Actually shows | Verdict for Scalar |
|---|---|---|---|---|---|
| 1 | `cloud-orbit` | `CloudOrbit` | motion, react-icons | An OpenAI mark ringed by Docker, AWS, Slack, DigitalOcean | **No.** Every node is a third-party brand we would have to replace |
| 2 ★ | `data-pipeline` | `DataPipeline` | gsap, react-icons | Green pipeline: a Drive-style folder, Filter/Transform/Refine, a colour brain glyph | **Adopted** as `RecordPipeline`. Green to primary, both glyphs redrawn in tokens |
| 3 ★ | `timeline` | `Timeline` | motion | A Gantt chart with a date ruler and an **orange** today marker | **Adopted** as `AuditTrail`. The orange is a direct `DESIGN.md` violation and was the first thing fixed |
| 4 ★ | `onboarding-steps` | `OnboardSteps` | gsap, react-icons | Four stacked steps with progress bars, behind very heavy fades | **Adopted** as `ThreeStepsLive`. Takes `step1..4` as props. Fades cut 180px of a 240px canvas and had to shrink |
| 5 | `workflowrun` | `WorkflowRun` | react-icons | Install / Lint / Build / Deploy run steps | Plausible for Autopilot. Not yet rendered in context |
| 6 | `model-mesh` | `ModelMesh` | motion | A T3 mark centred in rings of AI-provider logos | Only with all logos swapped for our own. Lower value than it looks |
| 7 ★ | `pagescan` | `PageScan` | - | A card grid, a browser frame, a travelling scan beam | **Adopted** as `EnrichScan` |
| 8 | `emptyproject` | `EmptyProject` | - | Stacked cards: "Your library is empty" | Weak alone. No motion library, so it is cheap if a blank-slate moment appears |
| 9 | `revenuechart` | `RevenueChart` | - | Bar chart, "$48,120.75, +38% vs last month" | **Highest risk.** A customer-results claim. Needs a sourced, attributable number |
| 10 | `spaminbox` | `SpamInbox` | - | **Not a spam inbox.** A revenue line chart ("$12,480, +4.2%") in a browser window | The name is actively misleading. Overlaps `CompoundingSection` |
| 11 | `chatthread` | `ChatThread` | - | Two messages, ending on a purple "Working..." indicator | Ends on the wait, not the answer |
| 12 ★ | `export-flow` | `ExportFlow` | motion | Five documents feeding up into "Export as CSV" | **Adopted** as `OwnYourData` |
| 13 ★ | `notification-stack` | `NotifyStack` | gsap, react-icons | A cursor clicks a notification centre; three cards spring in, then clear | **Adopted** as `SignalStack`. Takes its cards as a prop |
| 14 ★ | `agentresearch` | `AgentResearch` | - | A prompt resolving to two blog articles | **Adopted** as `DiscoverResearch`, with records instead of articles |
| 15 | `speedgauge` | `SpeedGauge` | - | A gauge in green, amber and red arcs | Multi-hue, against the single-accent rule, and a speed claim needs a benchmark |
| 16 | `bankcard` | `BankCard` | gsap, react-icons | A black debit card carrying a **Mastercard** mark | No. A brand mark we have no business showing |
| 17 | `apirequest` | `ApiRequest` | gsap, react-icons | `POST api.example.dev/v1/customers` with a JSON response | **Strong** for an MCP or developer page. The call must be real and runnable |
| 18 | `emptyschedule` | `EmptySchedule` | - | "Nothing scheduled, your week ahead is clear" | A good inversion, but Scalar is not a calendar |
| 19 | `modepicker` | `ModePicker` | gsap, react-icons | A chat composer with an Instant / Thorough menu | Only if Scalar ships named modes |
| 20 | `trendlines` | `TrendLines` | - | This week vs last week | Not yet rendered in context |
| 21 | `codeprompt` | `CodePrompt` | - | An editor writing a `useActivity` hook | Not Scalar's story |
| 22 | `agentcursors` | `AgentCursors` | react-icons | Builder / Debugger / Tester cursors over a dot grid | **Good** for a swarm or multi-agent moment. Do not ship with #23 |
| 23 | `codepresence` | `CodePresence` | react-icons | An editor with Ana and Leo collaborating | Mutually exclusive with #22 |
| 24 ★ | `recordimport` | `RecordImport` | - | A full-colour **Excel** mark feeding a person record. Its avatar loads `/pfp2.jpg`, **which is not in `public/`** and 404s | **Adopted** as `ScatteredToTyped`: Excel replaced with a `.md` document, avatar replaced with initials |
| 25 ★ | `handoffmenu` | `HandoffMenu` | react-icons | Run in Opencode / Open in Cursor / Build in Claude / Zed | **Adopted** as `AgentHandoff`, with our seven real MCP clients |
| 26 | `botreply` | `BotReply` | react-icons | A **Discord** window with a Notion bot replying | No. Two third-party products in one illustration |
| 27 | `integrationwall` | `IntegrationWall` | react-icons | ~25 consumer logos: Spotify, Notion, Figma, Twitch, Dropbox, GitHub | No. Almost none are Scalar integrations, and every logo is a promise |
| 28 | `metricschart` | `MetricsChart` | - | Active users / New signups / Upgrades, three lines | Overlaps `CompoundingSection`. Chart colours must be `--chart-1..5` |

### The staged fleet

The 22 un-adopted components stay in `src/components/forgeui/`, unreachable
from any page and tree-shaken out of the bundle, listed in the vendored-ignore
block in `eslint.config.mjs` - the same pattern the shark kit and the chart
engine already use.

**To adopt one - the method, and it is not optional:**

0. **Render it first.** Mount it on a scratch route and look at it. Names lie:
   `spaminbox` is a revenue chart, `recordimport` ships a Microsoft Excel mark
   and a 404ing avatar, `timeline` ships an orange marker. Never pick a
   component, or describe one in this file, from its filename.
1. **Copy the vendor file verbatim** into
   `src/components/marketing/illustrations/`.
2. **Edit only content and colour** in the copy: strings, data arrays, icon
   imports, `neutral-*` → tokens, foreign accent → `--primary`, fade masks →
   `var(--card)`.
3. Swap the component's private `FitScale` for the shared one, add the
   reduced-motion branch, and resize the canvas if our copy is longer than the
   vendor's.
4. Render it inside `IllustrationFrame`. Leave the original untouched so
   upstream stays diffable.

> **Never reimplement an illustration from scratch.** The library is bought for
> its craft - `notification-stack` is a 30-step GSAP timeline with a travelling
> cursor; `pagescan` is a card grid, a scan beam and a ten-blade spinner;
> `agentresearch` carries specific shadow and gradient work. Hand-writing
> something that merely echoes the composition throws all of that away and
> produces a worse illustration that also no longer tracks upstream. If a
> component genuinely cannot be bent to `DESIGN.md`, drop it and pick another -
> do not rebuild it.

### What the originals actually cost

Findings from wave one, so the next adoption budgets for them:

- **Mostly zero props.** Most are hardcoded scenes, so adapting means editing
  strings in place. `notification-stack` is the exception - it accepts
  `notificationCardItems`, so its signals are passed as data.
- **`text-primary` is a trap.** Several components use it for *body copy*. In
  Scalar `--primary` is baby blue, so importing them unedited paints every
  label blue. Route body copy back to `text-foreground` /
  `text-muted-foreground` and keep `--primary` for the one focal element.
- **Each ships its own private `FitScale` copy.** The adapted set shares one
  (`illustrations/fit-scale.tsx`). Delete the duplicate on adoption.
- **`export-flow` had a real bug:** its `useEffect` had no dependency array, so
  it tore down and re-armed a 3.2s interval on every render. Fixed in
  `OwnYourData`. Assume others have similar defects and read before trusting.
- **Opaque `var(--color-white)` fade masks** become visible blank rectangles
  over a tinted panel. Re-point to `var(--card)`, or delete the mask.
- **Brand colour hides in more than hex.** The sweep caught `#22c55e` and
  `#3b82f6` but missed Tailwind's `orange-500/600` in `timeline` and a green
  `rgba(104, 211, 145)` box-shadow that GSAP animates up in `data-pipeline`.
  Grep for `orange`, `emerald`, `green-`, `amber` and raw `rgba(` too, then look
  at the thing in both themes.
- **Third-party marks are common and disqualifying.** Excel, Mastercard,
  Discord, Notion, Spotify, GitHub and a wall of AI-provider logos all ship
  inside this set. Each one is a promise we have not made.
- **Renaming an arrow function breaks it.** `const X = (props) => {` rewritten
  to `export function X(props) {` leaves a dangling `}) => {`, and replacing the
  React import line silently drops `useRef`. Typecheck after every rename.
- **Fixed canvases clip.** `agentresearch` and `notification-stack` both
  overflowed their declared height once our copy replaced the vendor's.

---

## 8 · Open founder calls

1. **Wave two scope.** `timeline` for the agent's memory, `workflowrun` for
   Autopilot, `apirequest` for MCP, `emptyschedule` as an outcome - which,
   and on which pages?
2. **Sourced numbers.** `revenuechart`, `speedgauge` and `metricschart` stay
   unbuildable until there's a figure we can attribute. Same bar as
   testimonials in `DESIGN.md`.
3. **Rotate `FORGEUI_API_TOKEN`.**

---

*Correct this file in the same breath as the code. Stale memory is a bug.*
