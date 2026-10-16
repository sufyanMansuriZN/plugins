---
description: Point Claude Code's statusLine at session-bar (run once; saves any statusLine you had)
allowed-tools: Bash(python3 *)
disable-model-invocation: true
---
!`python3 "${CLAUDE_PLUGIN_ROOT}/setup.py"`

Repeat the line above to the user, word for word, and say the status line shows from the next refresh. Do nothing else.
