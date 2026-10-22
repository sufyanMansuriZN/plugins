#!/bin/sh
# Mods cannot read the session's permission mode, so this hook saves it with each prompt for
# start_session, which never starts a session in a higher mode than the one asking. start_session
# answers its own calls, so no PreToolUse is raised for them.
dir="$HOME/.claude/toolkit/permission-mode"
mkdir -p "$dir"
python3 -c '
import json, os, re, sys
e = json.load(sys.stdin)
sid, mode = e.get("session_id", ""), e.get("permission_mode", "")
if re.fullmatch(r"[0-9a-f-]+", sid) and re.fullmatch(r"[A-Za-z]+", mode):
    with open(os.path.join(sys.argv[1], sid), "w") as f:
        f.write(mode)
' "$dir"
exit 0
