#!/usr/bin/env bash
# Context pstack needs that Claude Code does not give it.
#
#   prompt    (UserPromptSubmit) A prompt that starts with /pstack:poteto-mode
#             or /poteto-mode marks the session. Every later prompt in a marked
#             session gets the skill's `reminder:` line plus the routing note,
#             and any prompt that invokes a pstack skill gets the routing note.
#             Silent when jq is missing.
#   subagent  (SubagentStart) Every subagent gets the routing note. No jq.
#   prune     (SessionStart) Drops session markers older than 7 days.
#
# The routing note exists because pstack skills are gated with
# disable-model-invocation, as upstream intends. The Skill tool neither lists
# nor loads them, so playbooks reach sibling skills by reading their SKILL.md,
# and subagents have no other way to learn where the plugin lives.
set -u
state=${XDG_STATE_HOME:-$HOME/.local/state}/pstack/mode
root=${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}

routing="pstack is installed at $root. In pstack skills, agents, and playbooks, <pstack> means that path. pstack skills are user-only slash commands, so the Skill tool refuses them and they are absent from your skill list. When pstack text tells you to use another pstack skill (/how, the **why** skill, \`unslop\`, and so on), Read $root/skills/<name>/SKILL.md and follow it, resolving its relative paths against that skill's directory. Do not call the Skill tool for pstack skills, except setup-pstack, deslop, control-ui, and control-cli."

case ${1:-prompt} in
prune)
  [ -d "$state" ] && find "$state" -type f -mtime +7 -delete 2>/dev/null
  exit 0
  ;;
subagent)
  esc=$(printf '%s' "$routing" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"%s"}}\n' "$esc"
  exit 0
  ;;
esac

command -v jq >/dev/null || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
[ -n "$sid" ] || exit 0
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
marker=$state/$sid

context=
if [ -e "$marker" ]; then
  reminder=$(sed -n '1{/^---$/!q}; 2,/^---$/{s/^reminder: *//p}' "$root/skills/poteto-mode/SKILL.md")
  context="${reminder:+$reminder }$routing"
else
  name=$(printf '%s\n' "$prompt" | head -1 | sed -nE 's#^[[:space:]]*/(pstack:)?([a-z0-9-]+)([[:space:]].*)?$#\2#p')
  [ -n "$name" ] && [ -d "$root/skills/$name" ] && context=$routing
fi
[ -n "$context" ] && jq -n --arg c "$context" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'

if printf '%s' "$prompt" | grep -qE '^[[:space:]]*/(pstack:)?poteto-mode([[:space:]]|$)'; then
  mkdir -p "$state" && touch "$marker"
fi
exit 0
