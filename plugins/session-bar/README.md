# session-bar

Native status line: git, model, context and usage windows (run /session-bar:setup once).

session-bar draws one row under the prompt through Claude Code's own `statusLine` setting:

```
main +3 ~2 · Opus 5.5 1M · ctx 42% · 5h 31% ↻2h10m · 7d 12% ↻3d4h
```

## Set it up

A plugin cannot set `statusLine` itself, so you run one command after you install or update the plugin.

1. Install the plugin: `claude plugin install session-bar@plugins`.
2. In a Claude Code session, run `/session-bar:setup`.
3. Read the line it prints. It names the file it changed.

Until you run setup, each new session shows one line that tells you to run it. Only you see that line; it does not go into the model's context.

To stop using it, run `/session-bar:remove`.

## What the commands do

- `/session-bar:setup` writes `statusLine` in `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`). The command is `python3 <marketplace copy>/statusline.py`, refreshed every 30 seconds. The marketplace copy is `~/.claude/plugins/marketplaces/plugins/plugins/session-bar/`, which moves forward each time the marketplace updates. If you already had a `statusLine` that is not session-bar's, setup saves it to `~/.claude/session-bar/previous-statusline.json` first. It keeps every other key. A second run changes nothing.
- `/session-bar:remove` puts back the saved `statusLine`, or removes session-bar's if none was saved.

Both need `python3` (3.8 or later) on `PATH`.

## What the row shows

Each part is left out when it has no value.

- **git**: the branch (a 7-character sha when detached), `+N` new files (untracked or added), `~M` changed files (modified, deleted or renamed). Left out outside a git repo.
- **model**: the model name Claude Code shows, then the context window size (`1M`, `200K`) when the name does not say it.
- **ctx**: how full the context window is. Yellow from 70%, red from 85%. It shows after the first response.
- **5h**, **7d**, **$**: the 5-hour and 7-day usage windows and the spend limit, with the time to the reset (`↻2h10m`). A window turns yellow when it is more than 15 points ahead of an even pace through the window, and red when it is more than 30 ahead or at 90% or more. A window with no reset time turns yellow from 50% and red from 80%.

When the terminal is too narrow, the git part is cut first. The other parts are never cut.

The usage figures are the ones Claude Code gives the status line from each response, so they change after a response and can read a point under `/usage`.
