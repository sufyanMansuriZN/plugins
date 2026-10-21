# Proposal

## Why

When the person opens a subagent's transcript from the tasks list, the native status line still names the main loop's model and context. A Haiku `Explore` agent reads as `Opus 5.5 1M · ctx 6%`. Measured live on 2.1.306: the statusLine JSON's `model.display_name` and `context_window` always describe the main loop, and nothing in it says which transcript is on screen. The mod API does say it: the `AbovePrompt` band's props carry `view: SiteView` (`{ agentId? }`), and a view switch re-runs the band's hook. So session-bar moves back to a mod, and every segment moves into the band.

## What Changes

- **BREAKING** The native status line goes: no `statusline.py`, no `/session-bar:setup`, no SessionStart hint. The row is drawn by a hooks module on the `AbovePrompt` band, on the terminal and desktop surfaces, with no setup step.
- The row keeps its segments, order, colors, pace rule, countdown and fit rule: git, model, context, 5h, 7d, spend limit, joined by a dim ` · `. Only git is cut, and the row fits the band's `bodyColumns`.
- The bar follows the transcript in view. With a subagent's transcript open, a dim agent type comes after git, the model is the one that subagent's requests name, and the context reads that agent's last request's input tokens (`ctx 42K`). Before its first request the model and context are left out. The usage windows are account-wide and show in every view.
- The model label comes from the model id (`claude-opus-5-5` reads `Opus 5.5`), with the main loop's window size after it in the main view.
- `/session-bar:remove` stays, so people who ran setup on 2.x can drop the old native row. The README tells them to run it once.
- Version 3.0.0. The description becomes "Session bar above the prompt: git, model, context and usage windows, following the transcript in view".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the row moves from the native status line to the `AbovePrompt` band and follows the transcript in view; setup and the hint go; remove stays for the old setting.

## Impact

- Removed: `statusline.py`, the setup path and `--hint` of `setup.py`, `commands/setup.md`, the SessionStart hook, `tests/test_statusline.py` and its fixtures.
- New: `hooks/hooks.json` (`modules`), `hooks/register.tsx`, `hooks/bar.ts`, `types/index.d.ts`, `tsconfig.json`, `*.test.ts(x)` run by `claude plugin test`.
- `plugin.json` (version, description, `types`), the root `README.md` and `.claude-plugin/marketplace.json` carry the new version and description; the plugin README is rewritten.
- People on 2.x see two rows until they run `/session-bar:remove`.
