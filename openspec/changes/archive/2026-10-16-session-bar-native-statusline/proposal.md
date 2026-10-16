# Proposal

## Why

session-bar 1.0.0 draws through the mod API's `$.ui.status`. Claude Code shows that as a pinned notification, `⚠ session-bar: <text>` in yellow. The user does not want the warning sign and the name in front of the figures. Claude Code's own `statusLine` setting draws a row with no prefix, so session-bar moves to it. A plugin cannot set `statusLine` (in 2.1.301 plugin settings take only `agent` and `subagentStatusLine`), so the plugin ships the script and a setup command that writes the setting once.

## What Changes

- **BREAKING** The mod goes: no hooks module, no `$.ui.status`, no OAuth usage endpoint fetch, no reading stamps.
- `statusline.py` (Python 3.8+, standard library only) reads the statusLine JSON on stdin and prints one row: git, model, context, 5h, 7d and spend limit. Usage figures come from `rate_limits` in that JSON.
- Color replaces the `!` and `!!` marks: yellow and red on the value, labels and separators dim.
- The row fits `COLUMNS` minus the 4 cells Claude Code keeps free. The git part is cut first; the gauges never are.
- `/session-bar:setup` writes `statusLine` in the user's settings to run the marketplace copy of the script every 30 seconds, and saves a `statusLine` that was there before. `/session-bar:remove` puts it back.
- A SessionStart hook shows the user one line, which the model does not see, until setup has run.
- Version 2.0.0. The description becomes "Native status line: git, model, context and usage windows (run /session-bar:setup once)".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the line moves to the native status line, the endpoint and reading requirements go, and setup, remove and the hint are added.

## Impact

- Removed: `plugins/session-bar/hooks/register.ts`, `register.test.ts`, `tsconfig.json`.
- New: `statusline.py`, `setup.py`, `commands/setup.md`, `commands/remove.md`, `hooks/hooks.json` (SessionStart), `tests/`, `README.md`.
- `plugin.json`, the root `README.md` and `.claude-plugin/marketplace.json` carry the new version and description.
- Users who update from 1.0.0 see no status line until they run `/session-bar:setup`.
