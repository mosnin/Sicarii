# 0016 - Twenty's structure, Scalar's colors

**Date:** 2026-10-09 · **Status:** SHIPPED (code, build + 487 tests green) · **Owner:** vision + the human (founder call on taste)

(Numbered 0016 because the unmerged `cursor/agent-mailboxes-fe1a` branch already
claims 0015.)

## The decision

Founder call: revamp the whole UI in the aesthetic of Twenty
(github.com/twentyhq/twenty) with Apple-level polish, keep all functionality,
and keep Scalar's identity: the baby-blue `#5AB0E8` + white/charcoal palette,
Space Grotesk headings, the ASCII signature, and the Home dashboard's bento layout.

Built:
- **Tokens** (`globals.css`): Scalar palette kept; added Twenty-style structure
  tokens (`surface`, `hover`, `pressed`, `fg-secondary/tertiary/light`,
  `border-strong/light`, tag palette); radius scale shrunk to Twenty's 4/8px;
  shadows reduced to Twenty's light/strong/heavy; `.app-shell` re-tunes the type
  ramp to a 13px body (`:root:has(.app-shell)`, reaches portals); `.twenty-table`
  and `.twenty-label` utilities.
- **Primitives**: Button (4px, 28/32px, Twenty secondary/tertiary), Input,
  Textarea, Card, Badge (Twenty tag), menus, dialogs, popovers, tooltips, Clerk.
- **Shell**: the floating magnifying dock + floating sidebar are replaced by
  Twenty's frame: a persistent 220px drawer on gray chrome (ASCII whisper
  behind it, collapsible, persisted as `scalar-sidebar`), a bordered page panel
  with a breadcrumb top bar, a flat mobile tab bar, and a command-menu launchpad.
- **Pages**: CRM list as a hairline record table; record pages as Twenty show
  pages; Discover, Radar, Agent, Settings, Field kanban, Autopilot, Skills,
  Context, auth, OAuth consent and the marketing site restyled. Home keeps the
  bento grid with the ASCII masthead.

## Gates

| Gate | Verdict | Rung |
|---|---|---|
| Desirable | PASS - founder asked for it explicitly | asserted by founder; **observation owed** |
| Feasible | PASS - tsc, eslint, `next build`, 487 tests green | tested |
| Deliverable | PASS - token-driven; future screens inherit it | reasoned |
| Viable | n/a (no cost change) | - |

**Tie-break (taste):** Twenty's gray/indigo palette was tried first and
reverted by the founder: structure from Twenty, color from Scalar.

## Debts owed to reality
- Founder observes the five seconds on the deployed app (light + dark, desktop + phone).
- Screens were verified on mock data only (no Clerk/DB in the sandbox).
