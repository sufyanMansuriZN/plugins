# Tasks

## 1. Confirm the Desktop assumptions

- [x] 1.1 Check the `Box` and `Text` props the desktop table accepts (`backgroundColor`, `borderRadius`, padding) in `.claude-plugin/types/claude-code/index.d.ts`, and record the choice in design.md decision 4. Verify: decision 4 names the props used.
- [ ] 1.2 Print `e.surface` and `e.props.bodyColumns` from a Desktop session (temporary log, removed after). Verify: the value is `desktop` and the column count is noted in design.md.

## 2. Desktop segments

- [x] 2.1 Add `desktopSegments` to `register.tsx`: a text pill per context or usage segment that needs attention, no bars, empty when none does. Verify: new unit tests in `register.test.ts` cover calm, 5h hot, ctx warn and ctx hot.
- [x] 2.2 Branch the `ui.render` hook on `e.surface`; return `next(e)` alone when the desktop result is empty. Verify: a mount test on `surface: 'desktop'` finds no directory, branch or model text, and skips the git call.
- [x] 2.3 Update the "row is always visible" test so its desktop loop expects the desktop behavior and the terminal loop keeps `skills` and `Opus 5.5`. Verify: the test passes.
- [x] 2.4 Add a desktop test for a subagent in view: no ctx pill, usage pill still shown. Verify: the test passes.

## 3. Release

- [x] 3.1 Run the full session-bar test file and the type check. Verify: all tests pass with no type errors, and terminal tests are unchanged.
- [x] 3.2 Bump the version in `plugins/session-bar/.claude-plugin/plugin.json` (and the marketplace entry if it carries one) and sync the spec on archive. Verify: version reads 0.11.0 where it is declared.
- [ ] 3.3 Open a Desktop session with the dev plugin and view the bar in a calm state and an attention state. Verify: no band from the mod shows when calm, and a pill shows when a window is ahead of pace.

## Workflow follow-up

- Archive the change after the Desktop check passes.
