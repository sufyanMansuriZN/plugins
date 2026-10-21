---
description: Take the session-bar 2.x row out of Claude Code's statusLine and put back the one you had (run once after updating to 3.0)
allowed-tools: Bash(python3 *)
disable-model-invocation: true
---
!`python3 "${CLAUDE_PLUGIN_ROOT}/setup.py" --remove`

Repeat the line above to the user, word for word. Do nothing else.
