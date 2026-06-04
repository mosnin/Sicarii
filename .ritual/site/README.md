# The Ritual — landing page

A zero-build static landing page in a black-and-red ASCII/ritual aesthetic.
Everything animated is hand-built: a canvas ritual-circle (five rotating method
nodes), a drifting ember glyph field, decode-on-scroll text, and animated ASCII
benchmark bars. Headings are set in **Jacquard 12**; body in **JetBrains Mono**.

Three files, no framework, no dependencies, no build step:

```
site/
├── index.html    structure + copy (honest benchmark numbers, incl. the null)
├── styles.css    the aesthetic (black/red, scanlines, vignette, ascii frames)
├── main.js       canvas sigil + embers + decode + animated bars
└── vercel.json   static headers + clean URLs
```

## Deploy to Vercel

It's a **static site** (no build step). `vercel.json` here declares exactly that —
no framework, no install, no build, serve the folder as-is — so Vercel won't try
to build it. The one thing that matters: **deploy the `site/` folder, not the repo
root** (the repo root is the framework, with no `index.html`).

### Option A — CLI (simplest, recommended)
Run from *inside* `site/`, so this folder *is* the project — no root-directory
confusion:
```bash
cd site
npx vercel          # first run: links/creates the project → preview URL
npx vercel --prod   # promote to production
```
On the first run accept the prompts (Framework = **Other** is auto-detected from
`vercel.json`; build command stays empty). Done.

### Option B — Git import (dashboard)
1. Push the repo, then on **vercel.com → Add New → Project**, import it.
2. **Set Root Directory to `site`.** ← this is the step people miss.
3. Framework Preset: **Other** · Build Command: *(leave empty)* · Output
   Directory: *(leave empty / `.`)* · Install Command: *(leave empty)*.
4. Deploy. Every push to the repo redeploys.

### Option C — drag & drop
Drag the **`site/`** folder onto **vercel.com/new** → instant deploy, no config.

### Sanity check before deploy
```bash
cd site && python3 -m http.server 8000   # → http://localhost:8000 should render
```
If it renders locally, it will render on Vercel — there's no build to differ.

## Local preview

Any static server works:
```bash
cd site && python3 -m http.server 8000   # → http://localhost:8000
```

## Notes

- Fully responsive; respects `prefers-reduced-motion` (animations freeze to a
  static frame, all content still reveals).
- The benchmark figures are the real A/B results — including the published null
  (no reasoning-accuracy edge on clean problems). Honesty is the brand; don't
  inflate them.
