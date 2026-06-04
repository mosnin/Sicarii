#!/usr/bin/env bash
#
# The Ritual — installer.
#
# Wires the Ritual into the repository it lives inside, so Claude performs it
# automatically. Safe to run more than once (idempotent). It never deletes or
# overwrites your content — it only adds an import line to CLAUDE.md.
#
# Usage, from your project's root:
#     git clone https://github.com/mosnin/kickoff .ritual
#     bash .ritual/install.sh
#
set -euo pipefail

# Where the Ritual lives (the directory this script is in).
RITUAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The host repo root = current working directory when you run the script.
HOST_DIR="$(pwd)"

# Case A: you cloned the Ritual *as* your project (direct clone). The root
# CLAUDE.md ignition is already in place — nothing to wire.
if [ "$RITUAL_DIR" = "$HOST_DIR" ]; then
  echo "This is a direct clone — the Ritual is the repo root."
  echo "Just open Claude here; it will perform the Ritual. Nothing to install."
  exit 0
fi

# Case B: vendored into an existing repo. Compute the import path from the host
# root to the Ritual (portable — no realpath/BSD issues).
case "$RITUAL_DIR" in
  "$HOST_DIR"/*) REL="${RITUAL_DIR#"$HOST_DIR"/}" ;;
  *)
    echo "Run this from the root of the repo you want to add the Ritual to:" >&2
    echo "    cd /path/to/your/repo && bash \"$RITUAL_DIR/install.sh\"" >&2
    exit 1
    ;;
esac

# Foot-gun guard: a nested .git turns the Ritual into a repo-inside-your-repo,
# which git won't track and which lands empty for your teammates. Warn, don't
# fail — the wiring below still works locally.
if [ -e "${RITUAL_DIR}/.git" ]; then
  echo "⚠  Heads up: ${REL}/.git exists, so ${REL}/ is a nested git repo."
  echo "   Your repo can't track its files and teammates will get it empty."
  echo "   Fix it with:  rm -rf \"${REL}/.git\""
  echo
fi

IMPORT="@${REL}/RITUAL.md"
CLAUDE="${HOST_DIR}/CLAUDE.md"

if [ ! -f "$CLAUDE" ]; then
  printf '# %s — Project Memory\n\n%s\n' "$(basename "$HOST_DIR")" "$IMPORT" > "$CLAUDE"
  echo "Created CLAUDE.md and wired in the Ritual ($IMPORT)."
elif grep -qF "$IMPORT" "$CLAUDE"; then
  echo "Already wired ($IMPORT). Nothing to do."
else
  # Preserve everything; add the import at the very top so it loads first.
  printf '%s\n\n%s\n' "$IMPORT" "$(cat "$CLAUDE")" > "$CLAUDE"
  echo "Wired the Ritual into your existing CLAUDE.md ($IMPORT)."
fi

# ---------------------------------------------------------------------------
# The Ratchet: register the SessionStart hook that re-injects retained memory
# (docs/decisions ledger + North Star) every session, so gains don't leak as
# context fills. See framework/07-the-ratchet.md. Never clobbers existing hooks.
# ---------------------------------------------------------------------------
HOOK="${RITUAL_DIR}/.claude/hooks/ratchet.sh"
[ -f "$HOOK" ] && chmod +x "$HOOK" 2>/dev/null || true
HOOK_CMD="\$CLAUDE_PROJECT_DIR/${REL}/.claude/hooks/ratchet.sh"
HOST_SETTINGS="${HOST_DIR}/.claude/settings.json"

if [ ! -f "$HOOK" ]; then
  : # nothing to wire
elif [ -f "$HOST_SETTINGS" ] && grep -q 'ratchet.sh' "$HOST_SETTINGS"; then
  echo "Ratchet hook already registered. Nothing to do."
elif [ ! -f "$HOST_SETTINGS" ]; then
  mkdir -p "${HOST_DIR}/.claude"
  cat > "$HOST_SETTINGS" <<JSON
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "${HOOK_CMD}" } ] }
    ]
  }
}
JSON
  echo "Registered the Ratchet (SessionStart hook) in .claude/settings.json."
else
  echo
  echo "⚠  You already have .claude/settings.json — not touching it. To turn on"
  echo "   the Ratchet (re-injects retained memory each session), add this hook:"
  echo
  echo "   \"SessionStart\": [ { \"hooks\": [ { \"type\": \"command\","
  echo "     \"command\": \"${HOOK_CMD}\" } ] } ]"
  echo
fi

cat <<'DONE'

Done. Open Claude in this repo. It reads CLAUDE.md, sees the Ritual, and
performs it — lighting the methods and asking for your founding documents.
DONE
