#!/usr/bin/env sh
# Injects the plain-focus rules (SKILL.md minus frontmatter) at session start.
skill="$(dirname -- "$0")/../skills/plain-focus/SKILL.md"
[ -f "$skill" ] || exit 0
awk 'c >= 2 { print } /^---[ \t]*$/ && c < 2 { c++ }' "$skill"
