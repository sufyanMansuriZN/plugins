# Tasks

## 1. Spike (throwaway, decides whether the rest ships)

- [x] 1.1 In a scratch mod folder outside the repo, call `$.ui.open({ id: 'probe' })` on `session.start` and `$.ui.toast` the `isPlaced` result; verify on Desktop that the toast reads `true` or `false` and record it in design.md
- [x] 1.2 If 1.1 is `true`: in the same scratch mod, draw one native `Button` after the pills in the desktop `AbovePrompt` branch; send two prompts and complete a turn with the Desktop window in view, and verify the bar does not flicker (record the result in design.md)
- [x] 1.3 If 1.1 is `false` or 1.2 flickers: stop, record the finding in design.md, and archive the change without code (`/opsx:archive`)

## 2. Pane data (pure functions, with tests)

- [x] 2.1 Add a function that turns `limits`, `weekly`, `ctx` and `now` into pane rows (percent, elapsed share, countdown, reset time of day, pace note) and verify `register.test.ts` covers the on-pace, ahead-of-pace, no-reset-time and context rows from the spec scenarios
- [x] 2.2 Add the reset time-of-day formatter (`18:40`, `Tue 17:30`) and verify tests for same-day, other-day and a missing reset time

## 3. Pane and button

- [x] 3.1 Draw the `Usage` button after the pills in the desktop branch, hidden once a pane open answers `isPlaced: false`, and verify a unit test that the terminal branch and the unplaced case draw none
- [x] 3.2 Add the `ui.render` hook for `{ component: 'Pane', requestId: 'usage' }` drawing the rows with non-interactive `Svg` meters and a tick, and verify with `tsc -p` and `claude plugin validate` on the plugin
- [ ] 3.3 Add the `ui.press` handler for the button that opens the pane or, if it is open, closes it via `$.ui.panes()`, and verify live that two presses open then close it

## 4. Live check and release

- [ ] 4.1 With the pane open, verify on Desktop that it neither flickers on send and turn complete nor redraws while idle for 3 minutes, and that the pills do not redraw on open or close
- [ ] 4.2 Sync the spec delta into `openspec/specs/session-bar`, bump the version in `plugin.json`, and verify `claude plugin test` passes

## Workflow follow-up

- Archive the change after the live check passes.
