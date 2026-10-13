# Tasks

## 1. Spike: can the mod read the TTL

- [x] 1.1 In a scratch mod outside the repo, on `turn.complete` (no `agentId`), find the transcript path (try `classic.Stop`'s `transcript_path`, else `$.session.id()` under `~/.claude/projects/`), `$.fs.read` it, and `$.ui.toast` the last `cache_creation` object; verify the toast shows the 1h and 5m counts, and record the working path source and read time in design.md
- [x] 1.2 If 1.1 cannot read the file: record the finding in design.md and stop; archive the change without code
- [x] 1.3 In the same scratch mod, on Desktop, wrap one Svg pill in a keyed `Box` with an absolute `display="none"` child (`hover={{ display: 'flex' }}`) that covers the pill row with one line of text; send 3 prompts and complete 3 turns with the pointer off and then on the pill, and verify the text shows on hover, hides on leave, and the bar does not flicker; record the result in design.md
- [x] 1.4 If 1.3 flickers or shows nothing: remove the "Desktop pills are not interactive" delta from the spec, record why in design.md, and drop task 3.4

## 2. Cache state data

Develop in a copy under `~/.claude/dev-mods/<session>/session-bar/` with the installed session-bar disabled, so each edit reloads.

- [x] 2.1 Add a pure function that takes transcript text and returns the TTL in ms or undefined (last line with `message.usage.cache_creation`, 1h only when 5m is 0, either key order, bad lines skipped); verify `register.test.ts` covers the four "Cache TTL from the transcript" scenarios
- [x] 2.2 Add the `cache` atom to `types/index.d.ts` and `register.tsx`; set it on main-loop `turn.complete`, clear it on `prompt.submit` (read before write); verify a mount test that a subagent's `turn.complete` sets nothing and a prompt hides the state
- [x] 2.3 Add a pure function from `cache`, ctx tokens and `now` to the state (`warm`, `soon`, `cold`, or none) and minutes left, with the 100K threshold; verify tests for every "Cache state" scenario

## 3. Drawing

- [x] 3.1 Terminal: append `❄ <countdown>` (dim), orange under 5 minutes, `❄ cold` (dim) to the ctx segment, dropping the countdown at tier 4; verify tests for the three terminal scenarios and the "Narrowest terminal with a warm cache" scenario, and that `layout` widths still fit
- [x] 3.2 Desktop pill: add flame, hourglass and snowflake glyph paths, draw the glyph after the value in the ink class, widen the pill only when shown, and add the state to the alt text; verify tests for the three pill scenarios and that `desktopTier` still picks one row at 161, 55, 44 and 33 cells
- [x] 3.3 Usage block: add the cache line under the context row's line; verify tests for the warm and cold lines
- [x] 3.4 Desktop hover text: wrap each pill in a keyed `Box` whose hidden absolute child shows the pill's alt text across the pill row on hover; verify a mount test that each pill's hover child holds its text and no element is `isInteractive`
- [x] 3.5 Extend `minuteKey` with the cache state, and its countdown only where drawn; verify tests for the two new redraw scenarios and that the existing redraw tests still pass

## 4. Live check and release

- [x] 4.1 In the hot-reloaded copy, check on the terminal and Desktop: the state appears after a turn at 100K or more, hides on send, Desktop redraws only on a state change while idle, and the glyph reads at a narrow window
- [x] 4.2 Sync the spec delta into `openspec/specs/session-bar`, bump `plugin.json` to 0.17.0, release (commit, push, `claude plugin update session-bar`), remove the dev-mods copy, re-enable the installed plugin, and verify `claude plugin test` passes and a new session shows the bar

## Workflow follow-up

- Archive the change after the live check passes.
