# Tasks

## 1. Spike (done: both gates passed)

- [x] 1.1 In a scratch mod folder outside the repo, call `$.ui.open({ id: 'probe' })` on `session.start` and `$.ui.toast` the `isPlaced` result; verify on Desktop that the toast reads `true` or `false` and record it in design.md
- [x] 1.2 If 1.1 is `true`: in the same scratch mod, draw one native `Button` after the pills in the desktop `AbovePrompt` branch; send two prompts and complete a turn with the Desktop window in view, and verify the bar does not flicker (record the result in design.md)
- [x] 1.3 If 1.1 is `false` or 1.2 flickers: stop, record the finding in design.md, and archive the change without code (`/opsx:archive`)

## 2. Row data, first version (done; reworked in 3.2)

- [x] 2.1 Add a function that turns `limits`, `weekly`, `ctx` and `now` into rows (percent, elapsed share, countdown, reset time of day, pace note) and verify `register.test.ts` covers the on-pace, ahead-of-pace, no-reset-time and context rows from the spec scenarios
- [x] 2.2 Add the reset time-of-day formatter (`18:40`, `Tue 17:30`) and verify tests for same-day, other-day and a missing reset time

## 3. Replace the pane with the inline block

Develop in a copy under `~/.claude/dev-mods/<session>/session-bar/` with the installed session-bar disabled, so each edit reloads; release only when right.

- [x] 3.1 Remove the pane code from `register.tsx` and the types: the `Pane` render hook, `toggleUsagePane`, the `noPanes` atom and its use, the `$.ui.panes()` read in the minute tick; add the `usageOpen` atom (session, default `false`) to the contract; verify `claude plugin validate` and `tsc -p` pass and the pane tests are gone
- [x] 3.2 Rework the row data: app names (`Session limit`, `Weekly · all models`, `Weekly · <model>`), the elapsed share as a shadow instead of a tick, the pace verdict (15-point rule), the cap time (only when ahead, a tenth of the window gone, something used), the reset as time left under a day else weekday and time, and the context row (meter to the ideal ceiling, line by level, window size as a fact); update `meter` to draw the shadow; verify `register.test.ts` covers each spec scenario for window rows, pace line, cap time and context row
- [x] 3.3 Check what width the desktop `AbovePrompt` props give (read the types), then draw the block above the pills when `usageOpen`: two rows per line from the row data, meters at the cell width (or the fixed estimate); add the icon-only chevron `Button` (`plain`, `▾` or `▴`, label "Usage details") that flips `usageOpen`; verify with a mount test that the button toggles the block and its glyph, the terminal draws neither, and the pills keep their labels
- [x] 3.4 Make the minute tick count countdowns while `usageOpen`, and verify a test that the key moves with a countdown when open and not when collapsed on Desktop only

## 4. Live check and release

- [x] 4.1 In the hot-reloaded copy, verify on Desktop that the chevron renders and is easy to hit, the block expands and collapses on press, does not flicker on send and turn complete, does not redraw while idle within a minute, and fits at a narrow window
- [x] 4.2 Sync the spec delta into `openspec/specs/session-bar`, bump the version in `plugin.json` to 0.16.0, release (commit, push, `claude plugin update session-bar`), remove the dev-mods copy, re-enable the installed plugin (`claude plugin enable session-bar@plugins`, disabled at user scope for the live check), and verify `claude plugin test` passes and a new session shows the bar

## Workflow follow-up

- Archive the change after the live check passes.
