#!/usr/bin/env bash
#
# THE RATCHET — re-injects the product's retained memory at the start of every
# session, so hard-won gains don't leak as the context window fills.
#
# Why this exists (the math): product quality compounds multiplicatively. With
# imperfect retention φ<1 the system mean-reverts to a bounded plateau of height
# g/(1−φ); only as φ→1 does it become exponential (Q = Q₀·e^{g t}). This hook is
# the ratchet that drives φ toward 1 — it makes retention a mechanism, not
# something the model has to remember to do. See framework/07-the-ratchet.md.
#
# It is read-only, dependency-free, idempotent, and never fails a session.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HEADING="$ROOT/docs/decisions/heading.md"
LEDGER="$ROOT/docs/decisions/README.md"
NORTH="$ROOT/docs/foundation/north-star.md"
CAP=70   # max lines pulled from any one file — protect the context budget

emit() { printf '%s\n' "$1"; }
# print up to CAP non-empty lines of a file, skipping HTML comments
quote_file() { [ -f "$1" ] && grep -vE '^\s*(<!--|-->)' "$1" | grep -vE '^\s*$' | head -n "$CAP"; }

emit "════════════════════════════════════════════════════════════════════"
emit "THE RATCHET — retained memory, re-injected this session (do not lose it)"
emit "════════════════════════════════════════════════════════════════════"
emit ""
emit "This product compounds only if gains are never re-litigated. Honor what is"
emit "below: build ON the patterns, PAY the open debts, and never re-open a KILL"
emit "or a FALSIFIED claim. If something here is stale, fix it in the same breath."
emit ""

if [ -f "$HEADING" ]; then
  emit "── ⟶ THE HEADING — the one thing to push right now (work this first) ──"
  quote_file "$HEADING"
  emit ""
fi

if [ -f "$NORTH" ]; then
  emit "── North Star (the taste calibration — judge Desirable against this) ──"
  quote_file "$NORTH"
  emit ""
fi

if [ -f "$LEDGER" ]; then
  emit "── Decision ledger: patterns that pass · open debts · kills/falsifieds ──"
  quote_file "$LEDGER"
  emit ""
else
  emit "── No decision ledger yet ──"
  emit "Create docs/decisions/README.md from templates/decision-ledger.md so gains"
  emit "start compounding. Until then, retention (φ) is low and the product plateaus."
  emit ""
fi

emit "════════════════════════════════════════════════════════════════════"
exit 0
