# Tasks

## 1. Layout for a subagent view

- [x] 1.1 Add `agent?: string` to `BarInput` and draw the first group as `dir · agent · model`, each part optional; verify new `segments`/`layout` tests: `plugins · Explore · Haiku 4.5`, `plugins · Plan` with no model, and the main bar unchanged (existing layout tests still pass)
- [x] 1.2 Add tests that a subagent `BarInput` with no `ctx` draws no context segment at every tier, and that `modelLabel('claude-sonnet-5-5')` without a window reads `Sonnet 5.5`; verify `claude plugin test plugins/session-bar` passes

## 2. Record agent models

- [x] 2.1 Add the `agentModels` state key to `types/index.d.ts` and its atom; add a `turn.step` observer that writes `e.model` for `e.agentId` only when it changed and returns `next(e)` untouched; verify `tsc` passes and a unit test of the update function (new id, same model, changed model, no `agentId`) passes
- [x] 2.2 Add an `agent.spawn` observer that writes the resolved `{ model, agentId }` from `next(e)`, returning the result untouched; verify by test that a spawn result seeds the map and a later step overrides it

## 3. Render follows the view

- [x] 3.1 In the `AbovePrompt` render, when `e.props.view.agentId` is set: read `agentModels`, call `$.agent.list()` and pick `type ?? name` by `id`, pass `ctx: undefined` and the label without a window; otherwise keep today's reads; verify `tsc` passes and the main-view tests are unchanged
- [x] 3.2 Live check: spawn a `haiku` Explore agent, open its transcript from the tasks list, and confirm the bar reads `plugins · Explore · Haiku 4.5` with no ctx segment and the usage windows intact; return to main and confirm `plugins · Opus 5.5 1M` with ctx; record the result in this task. Result (2026-10-07): pass, confirmed by the user with the worktree build loaded via `--plugin-dir`

## 4. Release

- [ ] 4.1 Bump `plugins/session-bar/.claude-plugin/plugin.json` to 0.9.0, run `claude plugin validate plugins/session-bar`, `tsc -p plugins/session-bar` and `claude plugin test plugins/session-bar`, commit, merge to main and push; verify `claude plugin update session-bar@plugins` installs 0.9.0
