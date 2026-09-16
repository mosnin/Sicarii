# Illustration System — Scalar's logged-out site

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
`DESIGN.md`** — baby blue, semantic tokens, Lucide, Scalar's nouns.

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
| `/product/discover` | `DiscoverResearch` | `agentresearch` | You describe the market. The list builds itself. |
| `/product/enrich` | `EnrichScan` | `pagescan` | Every field filled — and you can see where it came from. |
| `/product/signals` | `SignalStack` | `notification-stack` | You hear about the budget before the market does. |
| `/product/agent` | `AgentHandoff` | `handoffmenu` | Your agent already knows how to use it. |
| `/product/why` | `OwnYourData` | `export-flow` | One place your agents can't outgrow, and you can walk away with. |

Adapted components live in `src/components/marketing/illustrations/`.
Untouched vendor originals stay in `src/components/forgeui/` (§7).

**Integration surface — deliberately tiny.** `FeaturePage` gained one optional
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
  `feature01–09`) is not adopted. Scalar already has all four, built to
  `DESIGN.md`. Swapping them is a theme change, which §0 forbids. They stay
  available for a page that has no equivalent yet, never as a replacement.

---

## 2 · The law

A visitor decides in about five seconds, and they scan the picture before they
read the headline. So the picture carries the argument.

**The three-layer rule.** Every illustrated section has exactly three layers:

| Layer | Carries | Rule |
|---|---|---|
| **Illustration** | The proof — you can *see* it happen | Shows the after-state, never the apparatus |
| **Claim** | The promise — what changes for you | A benefit sentence. Never a feature name |
| **Detail** | The mechanism, one line | Earned only after the promise has landed |

`IllustrationFrame` enforces the shape: it takes `claim` and optional
`detail`, and the illustration is its child.

**Show the after, not the apparatus.** This is the edit that mattered most in
wave one, twice:

- `pagescan` ends on a "Scanning page…" spinner. `EnrichScan` ends on the
  fields it produced, each with its source. Scanning is our problem; filled
  fields are the customer's benefit.
- `agentresearch` ends on two blog articles — the exact thing Discover
  promises never to return. `DiscoverResearch` ends on typed company records,
  one of them a dedupe skip.

**The inversion test.** Write the sentence the illustration makes a visitor
feel. If it describes the software, rewrite it to describe their day.

- ✗ "Multi-source enrichment with provenance tracking"
- ✓ "Every field filled — and you can see where it came from."

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
| Home | 0 new | Already at capacity — replace, don't append |
| Pricing | 0–1 | Only if it answers an objection |
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
"adapted to our product" means in practice — and it is entirely a matter of
bending the component toward `DESIGN.md`.

**Speak Scalar's nouns**
- [ ] Every visible string is Scalar's vocabulary. Zero vendor demo copy
- [ ] Company/person names are invented, never real businesses
- [ ] Every number is defensible or obviously illustrative
- [ ] Brand marks shown are real, shipping integrations only

**Wear Scalar's skin**
- [ ] No `neutral-*`, no `#hex`, no foreign accent. Semantic tokens only:
      `bg-card` `bg-background` `bg-muted` `text-foreground`
      `text-muted-foreground` `border-border` `text-primary` `bg-primary`
- [ ] Baby blue (`--primary`) is the only accent — §2 of `DESIGN.md`
- [ ] Correct in **light and dark**. Light is the default and the one stock
      components get wrong
- [ ] Radius and border weight match the surrounding cards
- [ ] Fades/masks use `var(--card)`, not `var(--color-white)`/`black` — an
      opaque white fade over a tinted panel reads as a broken blank box
      (this is exactly what happened to `export-flow`; see §7)

**Move like Scalar**
- [ ] Entry ≤ 400ms, shared easing `[0.16, 1, 0.3, 1]`, calm
- [ ] `prefers-reduced-motion` renders the **final** state — not a slower one.
      Vendor components ship raw CSS keyframes with no such guard; add the
      `@media (prefers-reduced-motion: reduce)` block yourself
- [ ] Looping animation is capped, not infinite ambient churn

**Behave**
- [ ] Decorative wrapper is `aria-hidden` — the claim is the content
- [ ] No focusable elements inside
- [ ] Fits at 375px via `FitScale` (shrink to fit, never upscale, never
      overflow — the horizontal lock in `DESIGN.md` §8 has no tolerance)
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
  components import it, pulling Feather/Heroicons/Font Awesome/Simple Icons —
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

## 7 · The catalog — all 28

Verified on install: export name, animation library, and the count of
hardcoded hex values that must be re-tokenised. "Ships" is the vendor's demo
content — what you are actually replacing.

`★` = adopted in wave one.

| # | Component | Export | Libs | Hex | Ships | Fit for Scalar |
|---|---|---|---|:-:|---|---|
| 1 | `cloud-orbit` | `CloudOrbit` | motion, react-icons | 3 | Orbiting nodes | **Weak.** The most clichéd SaaS visual there is; only works if every node is named and true |
| 2 | `data-pipeline` | `DataPipeline` | gsap, react-icons | 11 | Filter → Transform → Refine | Redundant with `AgentCircuit` |
| 3 | `timeline` | `Timeline` | motion | 3 | Release-note tasks on dates | **Good** — the agent's memory / audit trail ("It remembers") |
| 4 | `onboarding-steps` | `OnboardSteps` | gsap, react-icons | 2 | Create account → profile → dashboard | **Good** for a `CLOSE` slot. Three steps max; four reads as work |
| 5 | `workflowrun` | `WorkflowRun` | react-icons | 2 | Install/Lint/Build/Deploy | **Good** for Autopilot — show a run that *finished* |
| 6 | `model-mesh` | `ModelMesh` | motion | 10 | Interconnected models | Skip. Naming models is a maintenance debt |
| 7 ★ | `pagescan` | `PageScan` | — | 1 | A page under a scan beam | **Adopted** → `EnrichScan` |
| 8 | `emptyproject` | `EmptyProject` | — | 6 | Blank slate | Cheapest in the set (no motion lib). Needs a resolution beside it |
| 9 | `revenuechart` | `RevenueChart` | — | 2 | Revenue climbing | **Highest risk.** A customer-results claim. Needs a sourced, attributed number |
| 10 | `spaminbox` | `SpamInbox` | — | 2 | A junk-filled inbox | **Good** as `BEFORE` only ("output rots in scattered .md files") — must resolve on the same screen |
| 11 | `chatthread` | `ChatThread` | — | 4 | Billing question + "Working…" | Ends on a typing indicator; would need to end on the answer |
| 12 ★ | `export-flow` | `ExportFlow` | motion | 3 | Docs → "Export as CSV" | **Adopted** → `OwnYourData` |
| 13 ★ | `notification-stack` | `NotifyStack` | gsap, react-icons | 1 | ChatGPT/Twitter/Claude pings | **Adopted** → `SignalStack` |
| 14 ★ | `agentresearch` | `AgentResearch` | — | 2 | "Find me a standing desk" → articles | **Adopted** → `DiscoverResearch` |
| 15 | `speedgauge` | `SpeedGauge` | — | 9 | A gauge | Only with a measured benchmark and stated method |
| 16 | `bankcard` | `BankCard` | gsap, react-icons | 5 | A payment card | Possible for x402 "it can pay its own way". Careful on pricing — we lead "free to start" |
| 17 | `apirequest` | `ApiRequest` | gsap, react-icons | 2 | Request/response | **Good** for MCP/developer docs. The call must be real and copy-pasteable |
| 18 | `emptyschedule` | `EmptySchedule` | — | 2 | A cleared calendar | **Strong inversion** — an empty state sold as the win |
| 19 | `modepicker` | `ModePicker` | gsap, react-icons | 3 | Instant vs Thorough | Only if Scalar ships named modes |
| 20 | `trendlines` | `TrendLines` | — | 3 | This week vs last week | Safer than `revenuechart`: shape without a claimed figure |
| 21 | `codeprompt` | `CodePrompt` | — | 21 | Prompt → a `formatDate` helper | Output must be correct code; developers read it |
| 22 | `agentcursors` | `AgentCursors` | react-icons | 5 | Builder / Debugger / Tester cursors | **Good** for multi-agent. Name cursors by job. Don't ship with #23 |
| 23 | `codepresence` | `CodePresence` | react-icons | 26 | Collaborators in a file | Mutually exclusive with #22 |
| 24 | `recordimport` | `RecordImport` | — | 3 | A spreadsheet import | Carries a **full-colour Excel logo** — gut it or skip it |
| 25 | `handoffmenu` | `HandoffMenu` | react-icons | 1 | Cursor / Zed / Opencode | **Adopted** → `AgentHandoff`, with our real clients |
| 26 | `botreply` | `BotReply` | react-icons | 13 | An auto-reply | The sample reply must be good enough to want to receive |
| 27 | `integrationwall` | `IntegrationWall` | react-icons | 27 | A logo grid | Every logo is a promise. Only shipping integrations |
| 28 | `metricschart` | `MetricsChart` | — | 5 | Active users / signups / upgrades | Overlaps `CompoundingSection`; chart colours must be `--chart-1..5` |

### The staged fleet

The 22 un-adopted components stay in `src/components/forgeui/`, unreachable
from any page and tree-shaken out of the bundle, listed in the vendored-ignore
block in `eslint.config.mjs` — the same pattern the shark kit and the chart
engine already use.

**To adopt one — the method, and it is not optional:**

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
> its craft — `notification-stack` is a 30-step GSAP timeline with a travelling
> cursor; `pagescan` is a card grid, a scan beam and a ten-blade spinner;
> `agentresearch` carries specific shadow and gradient work. Hand-writing
> something that merely echoes the composition throws all of that away and
> produces a worse illustration that also no longer tracks upstream. If a
> component genuinely cannot be bent to `DESIGN.md`, drop it and pick another —
> do not rebuild it.

### What the originals actually cost

Findings from wave one, so the next adoption budgets for them:

- **Mostly zero props.** Most are hardcoded scenes, so adapting means editing
  strings in place. `notification-stack` is the exception — it accepts
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
- **Fixed canvases clip.** `agentresearch` and `notification-stack` both
  overflowed their declared height once our copy replaced the vendor's.

---

## 8 · Open founder calls

1. **Wave two scope.** `timeline` for the agent's memory, `workflowrun` for
   Autopilot, `apirequest` for MCP, `emptyschedule` as an outcome — which,
   and on which pages?
2. **Sourced numbers.** `revenuechart`, `speedgauge` and `metricschart` stay
   unbuildable until there's a figure we can attribute. Same bar as
   testimonials in `DESIGN.md`.
3. **Rotate `FORGEUI_API_TOKEN`.**

---

*Correct this file in the same breath as the code. Stale memory is a bug.*
