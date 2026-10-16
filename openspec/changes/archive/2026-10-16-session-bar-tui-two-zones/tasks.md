# Tasks

## 1. Start from the cold-alarm code

- [x] 1.1 Merge `main` into this branch once `session-bar-cache-after-model` and `session-bar-cache-cold-alarm` are committed there, so `cacheRun` draws the cache pills and the cache section follows the model. Verify: `bun test plugins/session-bar` passes and `segments()` puts `cache 38m` right after the model.

## 2. Grey, bold values and the pill's bar shade

- [x] 2.1 In the terminal runs (`segments`, `segment`, `cacheRun`), replace every `dimColor: true` with a `GREY = '#777777'` colour, and make each gauge's value `bold`. Leave the Desktop path's colours alone. Verify: a test that no run from `segments()` at any tier has `dimColor`, that labels, separators, countdowns and the bar's remainder are `#777777`, and that values are bold with no colour.
- [x] 2.2 Mark the bar's remaining part (and the context tick while it sits in the remainder) with `rest: true`; in `segment()` colour those runs `REST_ON[level]` (`#94690A` orange, `#8A420A` vermillion) and the rest `ON_ATTN`; strip `rest` in the terminal render before spreading a run onto `<Text>`. Verify: a test that an orange 5h pill at 62% has its used part `#191919` and its remainder `#94690A`, all on the `#E69F00` fill; update `calm segments are bare text; only attention gets a pill, all on its fill`.

## 3. Gauges hold their columns

- [x] 3.1 In `meter()`, pad values with `padStart(4)` and countdowns with `padEnd(5)`. Verify: tests that a 40-minute 5h countdown reads `40m  ` and a 9% window reads `  9%`.
- [x] 3.2 Make a calm `segment()` return its runs between two 1-space runs, so it is as wide as its square pill. Verify: a test that a gauge's `width()` is the same calm and as a pill, and that gauges after a context going from 87K to 187K start at the same offset. Found: the pill caps had been empty strings since the first commit; real rounded caps were tried and dropped after the live check, on the user's call, so pills stay square.

## 4. Two zones

- [x] 4.1 Make `segments(b, tier)` return `{ left, right }`: identity and cache on the left with ` · ` between identity sections (a cache pill after one blank cell instead), ctx and windows on the right joined by one blank run. Update every caller and test that reads it (`pace, countdown, bar`, `context`, `context bar`, `tiers and layout`, `a subagent in view`, `branch shows after the dir`, `cache in the terminal bar`). Verify: those tests pass with the new expected strings, e.g. the subagent left zone `skills · Explore · Haiku 4.5` and no ` · ` in the right zone.
- [x] 4.2 Make `layout(b, columns)` keep the first tier where `width(left) + GAP + width(right) <= columns`, with `GAP = 3`, and return both zones. Verify: `tiers and layout` checks that a full bar fits at exactly that sum and drops to the next tier one cell under it.
- [x] 4.3 In the terminal render, draw a row `<Box>` with the left zone in `<Box flexGrow={1}>` and the right in `<Box marginLeft={GAP}>`. Verify: a mount test at `bodyColumns` equal to the picked tier's width draws one row whose text starts with the identity and ends with the last gauge.
- [x] 4.4 After the live check: bars 5 cells at every width, and the short-bars tier removed (tiers 0 full, 1 5h countdown only, 2 no bars, 3 no countdowns). Verify: `tiers and layout` drops from the weekly-countdown-less form straight to no bars; `context bar` checks 5-cell ctx bars and the warn tick.
- [x] 4.5 Found in the live check: when even tier 3 is too wide (a long worktree dir and branch), each zone wrapped inside its own box. Make the left zone one `<Text wrap="truncate-end">` in a shrinkable box and the right zone not shrink. Verify: the terminal mount test checks the left box shrinks with `truncate-end` and the right does not (the test kit does not lay out cells); in tmux at 110, 90 and 70 columns the bar is one row, gauges whole, identity ending in `…`.

## 5. Live check

- [x] 5.1 Load the dev copy via dev-mods hot reload and check in Ghostty, on a light and a dark theme: calm, a cache pill, a context pill and a window pill, at full width and at a width that drops a tier. Verify: the user confirms it matches the F preview and no gauge shifts between calm and pill. First pass: layout confirmed; square pills and shorter meters asked for (3.2, 4.4). Recheck (2026-10-16, with 4.5's truncation): confirmed by the user.

## Workflow follow-up

- Release after `session-bar-cache-cold-alarm` is released: bump `plugins/session-bar/.claude-plugin/plugin.json`, commit, push, `claude plugin update`, on the user's go-ahead.
- Archive this change after `session-bar-cache-cold-alarm` is archived, as both modify Width adaptation and Cache state in the terminal bar.
