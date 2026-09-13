# Verification and release boundary

Revision 2, 2026-09-13. Baseline `7922be8b22e6f7cd3e6041ddecfeceac8f0a4414`.

## Completed
- Production build completed. Build route summary is in `evidence/build-summary.txt`.
- 13 public route scenarios returned HTTP 200, one H1, a description and no horizontal overflow.
- Pricing checked at 390, 768, 1024 and 1440 CSS pixels.
- Product, Solutions, Resources and Company menus opened from the keyboard, closed with Escape and returned focus. Mobile navigation exposed Solutions and returned focus on close.
- No page-level JavaScript errors in the recorded browser pass.
- Axe WCAG A/AA automated scan reported no violations on the two routes recorded in `evidence/accessibility.json`. This is a sample, not a complete accessibility certification.
- Existing theme, fonts, source graphics and global styles retained. Scalar text contrast and reduced-motion handling were refined within the existing blue palette.
- Source and public copy distinguish capabilities, illustrative examples, assumptions and pricing proposals. See `PRICING.md`, `OFFER.md`, `VALUE.md` and `INFLUENCE.md`.

## Reproduce
Run a production preview, then `WEBSITE_TEST_PACKAGE_JSON=/path/to/test-runtime/package.json node docs/website-repositioning/verify-public-site.cjs http://localhost:PORT`. The test runtime must provide playwright-core and Chrome. The recorded run used the existing local Operate test runtime. The script performs read-only public navigation, captures evidence and exits nonzero on a failed assertion.

## Limits
Local public-page evidence does not establish hosted deployment, real sign-in, onboarding, provider execution, checkout, credit enforcement or customer willingness to pay. No live charge, message, database push, catalog activation or customer migration was performed. The 132-item checklist preserves unmeasured requirements as `not_tested`; no overall premium score or full-framework pass is claimed. Existing authenticated flows and legal terms were retained. Permissioned customer proof and unique new per-page artwork were not supplied; the new pages reuse the existing theme's editorial components.

Build command: `next build --webpack`, with filesystem build caching temporarily disabled to fit local disk capacity; the configuration was restored afterward. The npm build wrapper was avoided because it pushes the database schema. The preview used a public Clerk key and a deliberately nonfunctional local secret placeholder. Dependencies came from the locked install; changed-file ESLint and TypeScript checks passed. Missing provider configuration remains a hosted gate.

Reduced-motion regression: the sample demo reaches its completed board with no blur filter. See `evidence/reduced-motion.json` and `verify-reduced-motion.cjs`, which uses the same test runtime environment variable as the public route script.
