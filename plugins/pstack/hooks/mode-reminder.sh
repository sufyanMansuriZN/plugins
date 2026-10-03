#!/usr/bin/env bash
# Keeps poteto-mode sticky for the rest of a session, as upstream intends.
# A prompt that starts with /pstack:poteto-mode or /poteto-mode marks the
# session. Every later prompt in a marked session gets the skill's
# `reminder:` line as context. `prune` (SessionStart) drops markers older
# than 7 days. Silent when jq is missing.
set -u
state=${XDG_STATE_HOME:-$HOME/.local/state}/pstack/mode
root=${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}

if [ "${1:-}" = prune ]; then
  [ -d "$state" ] && find "$state" -type f -mtime +7 -delete 2>/dev/null
  exit 0
fi

command -v jq >/dev/null || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
[ -n "$sid" ] || exit 0
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
marker=$state/$sid

if [ -e "$marker" ]; then
  reminder=$(sed -n '1{/^---$/!q}; 2,/^---$/{s/^reminder: *//p}' "$root/skills/poteto-mode/SKILL.md")
  [ -n "$reminder" ] && jq -n --arg c "$reminder" \
    '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
fi

if printf '%s' "$prompt" | grep -qE '^[[:space:]]*/(pstack:)?poteto-mode([[:space:]]|$)'; then
  mkdir -p "$state" && touch "$marker"
fi
exit 0
