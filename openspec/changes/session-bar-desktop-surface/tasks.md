# Tasks

## 1. Confirm the Desktop assumptions

- [x] 1.1 Check the `Box` and `Text` props the desktop table accepts (`backgroundColor`, `borderRadius`, padding) in `.claude-plugin/types/claude-code/index.d.ts`, and record the choice in design.md decision 4. Verify: decision 4 names the props used.
- [x] 1.2 Confirm the desktop path runs in the live app. Verified: with 0.11.0 installed, Desktop showed only a `ctx 161K` pill and the old bar was gone, so `e.surface` is `desktop`. The `bodyColumns` value is not needed: the desktop path skips the tiers.

## 2. Desktop segments

- [x] 2.1 Add `desktopSegments` to `register.tsx`: a text pill per context or usage segment that needs attention, no bars, empty when none does. Verify: new unit tests in `register.test.ts` cover calm, 5h hot, ctx warn and ctx hot.
- [x] 2.2 Branch the `ui.render` hook on `e.surface`; return `next(e)` alone when the desktop result is empty. Verify: a mount test on `surface: 'desktop'` finds no directory, branch or model text, and skips the git call.
- [x] 2.3 Update the "row is always visible" test so its desktop loop expects the desktop behavior and the terminal loop keeps `skills` and `Opus 5.5`. Verify: the test passes.
- [x] 2.4 Add a desktop test for a subagent in view: no ctx pill, usage pill still shown. Verify: the test passes.

## 3. Release

- [x] 3.1 Run the full session-bar test file and the type check. Verify: all tests pass with no type errors, and terminal tests are unchanged.
- [x] 3.2 Bump the version in `plugins/session-bar/.claude-plugin/plugin.json` (and the marketplace entry if it carries one) and sync the spec on archive. Verify: version reads 0.11.0 where it is declared.
- [x] 3.3 Open a Desktop session with the installed plugin and view the bar. Verified for 0.11.0: a `ctx 161K` pill shows at 161K tokens and the old bar is gone.

## 4. Ring badges (0.12.0)

- [x] 4.1 Add a `ring(pct, level)` helper that returns the SVG source: an 18px ring, neutral track, arc in `ATTN[level]`, stroke-dasharray from the share (clamped 0-100). Verify: unit tests cover 0, 50, 100, over 100, and both attention colors.
- [x] 4.2 Change `desktopSegments` to return a model of badges (label text, ring share, level) and draw each in the hook as a `Box` row with an `Svg` (explicit `width`, `height`, `alt`) and a `Text` in the app's own color. Verify: unit tests find the arc share (ctx against the hot threshold, windows by percent) and no filled background; the desktop mount test finds the badge text and still finds no dir, branch or model.
- [x] 4.3 Update the earlier desktop tests (2.1, 2.2, 2.4) from text pills to ring badges. Verify: the full test file and `tsc --noEmit` pass.
- [x] 4.4 Bump `plugin.json` to 0.12.0, commit and push, run `claude plugin marketplace update plugins && claude plugin update session-bar`, and restart Desktop. Verify: with ctx past 150K, a ring badge shows beside `ctx` text, the ring and text sit on one baseline, and it reads in light and dark.

## 5. Pills with hover (0.13.0)

- [x] 5.1 Rework `desktopSegments` to build all candidate badges (ctx without label, windows with dim label and bold value, countdown on 5h only), return none while all are calm and all once one needs attention, each carrying its level, share and hover text. Verify: unit tests cover calm, one attention, ctx label absent, 5h-only countdown, and hover text for ctx and a window.
- [x] 5.2 Replace `ring` with a `pill(badge)` helper returning the SVG source and width: rounded rect, ring, text, `<title>`, and a `prefers-color-scheme` style. Verify: unit tests find the ring arc share, the tint per level, the neutral fill when calm, the title, and both color schemes.
- [x] 5.3 Draw each pill in the hook as an interactive `Svg`. Verify: the desktop mount test finds an `Svg` per pill and none when calm, and `tsc --noEmit` and the full test file pass.
- [x] 5.4 Bump `plugin.json` to 0.13.0, commit and push after the user's go-ahead, update the plugin, restart Desktop. Verified on screen (0.13.2): pills are rounded and unclipped, hover shows the card, and the pills read in light and dark.
- [x] 5.5 Fix the 5h pill's right padding (countdown width estimate raised from 6.4 to 7.6 px per character, measured from a live screenshot) and align the usage pills left and the context pill right. Verify: the full test file and `tsc --noEmit` pass; confirm on screen after release.

## 6. Fewer redraws (0.13.3)

- [x] 6.1 Skip state writes when a reading is unchanged (`session.measure` for limits and context, the usage fetch, `agent.spawn`) and tick each minute only when a countdown or pace band moved. Verified by tests: a repeated measurement writes nothing, a moved context writes only context, a moved window writes only limits, and the minute key changes only when a countdown or pace band does.
- [ ] 6.2 Release 0.13.3 after the user's go-ahead, update the plugin, restart Desktop. Verify: the user reports how often the bar still flickers. If it still flickers, the interactive `Svg` frames rebuild on each redraw and hover must be traded for a steady bar.

## Workflow follow-up

- Archive the change after the Desktop check passes.
