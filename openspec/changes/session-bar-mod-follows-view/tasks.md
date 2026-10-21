# Tasks

## 1. The core

- [ ] 1.1 Write `hooks/bar.ts`: the types, `parseGit`, `parseWindows`, `modelLabel` and `segments(input, columns)`. Verify: `claude plugin test plugins/session-bar` passes the ported statusline cases (example row, each segment absent, context and pace colors, countdowns, a passed reset, the git cut).

## 2. The band

- [ ] 2.1 Write `hooks/register.tsx`, `types/index.d.ts`, `hooks/hooks.json` with `modules`, and `"types"` in `plugin.json`. Verify: `claude plugin validate plugins/session-bar` is clean and tsc with the header's tsconfig passes.
- [ ] 2.2 Test the band. Verify: `claude plugin test plugins/session-bar` passes a main view render, a subagent view after a Haiku step (agent type and `Haiku 4.5`, no main model), a subagent with no step (no model), and a narrow `bodyColumns` that cuts git only, on terminal and desktop.

## 3. Subtract

- [ ] 3.1 Remove `statusline.py`, `commands/setup.md`, the setup path and `--hint` of `setup.py`, the SessionStart hook, `tests/test_statusline.py` and its fixtures. Verify: `python3 -m unittest discover -s plugins/session-bar/tests` passes the remove tests.

## 4. Docs

- [ ] 4.1 Set version 3.0.0 and the new description in `plugin.json`, `README.md` and `.claude-plugin/marketplace.json`, and rewrite `plugins/session-bar/README.md`. Verify: `grep -rn "3.0.0\|following the transcript" README.md .claude-plugin plugins/session-bar` shows each.

## 5. Release

- [ ] 5.1 Live check in a session with a subagent: open its transcript and see its type and model. Archive this change after the user accepts 3.0.0.
