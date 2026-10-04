#!/usr/bin/env bash
# Checks pstack-context.sh against sample hook inputs.
# Usage: test-context.sh [path/to/pstack-context.sh]   (default: the overlay copy)
set -u
here=$(cd "$(dirname "$0")" && pwd)
hook=${1:-$here/overlay/hooks/pstack-context.sh}
export CLAUDE_PLUGIN_ROOT=$(cd "$here/../../plugins/pstack" && pwd)
export XDG_STATE_HOME=$(mktemp -d); trap 'rm -rf "$XDG_STATE_HOME"' EXIT
fail=0
check() { # name, actual, expected-substring ("" = must be empty)
  if [ -z "$3" ]; then [ -z "$2" ] && echo "ok   $1" || { echo "FAIL $1: expected nothing, got: ${2:0:80}"; fail=1; }
  else case $2 in *"$3"*) echo "ok   $1" ;; *) echo "FAIL $1: missing '$3' in: ${2:0:80}"; fail=1 ;; esac; fi
}
ctx() { jq -n --arg s "$1" --arg p "$2" '{session_id: $s, prompt: $p}' | "$hook" prompt | jq -r '.hookSpecificOutput.additionalContext // empty'; }

routing="Read $CLAUDE_PLUGIN_ROOT/skills/<name>/SKILL.md"
sub=$(CLAUDE_PLUGIN_ROOT='/tmp/a "b"\c' "$hook" subagent | jq -r '.hookSpecificOutput.additionalContext' 2>/dev/null)
check "subagent: valid JSON, escaped path" "$sub" 'Read /tmp/a "b"\c/skills/<name>/SKILL.md'
check "subagent: real root" "$("$hook" subagent | jq -r .hookSpecificOutput.additionalContext)" "$routing"
check "prompt /how" "$(ctx s1 '/how x')" "$routing"
check "prompt /pstack:interrogate" "$(ctx s1 '/pstack:interrogate')" "$routing"
check "prompt /unknown-skill" "$(ctx s1 '/unknown-skill')" ""
check "prompt hello, unmarked" "$(ctx s1 'hello')" ""
check "prompt later line /how ignored" "$(ctx s1 $'hello\n/how x')" ""
check "prompt /pstack:poteto-mode" "$(ctx s2 '/pstack:poteto-mode go')" "$routing"
marked=$(ctx s2 'hello')
check "marked: reminder" "$marked" "apply /poteto-mode"
check "marked: routing" "$marked" "$routing"
"$hook" prune; check "prune keeps fresh marker" "$(ls "$XDG_STATE_HOME/pstack/mode")" "s2"
exit $fail
