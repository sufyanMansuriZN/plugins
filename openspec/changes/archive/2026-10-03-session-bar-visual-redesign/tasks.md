# Tasks

## 1. Spike: cache reading

- [x] 1.1 In a `session.measure` hook, call `$.session.usage({ breakdown: 'summary' })` and print `context.breakdown.apiUsage` and the call's duration via `$.ui.toast`; verify after one turn that `apiUsage` is non-null and the call takes under 50ms. If either fails, drop group 5 and the cache-pill requirement from the spec before going on

## 2. Pure helpers

- [x] 2.1 Add `elapsed(resetsAt, windowMs, now)` and the window-length table (5h, 7d, per-model weekly = 7d); verify with tests at 0%, 75% and past-reset (clamped to 1)
- [x] 2.2 Add `paceBand(pct, elapsed)` (orange > +15, red > +30 or pct >= 90) and keep `band` as the no-reset fallback; verify with tests for each scenario in the spec's "Pace-based attention" requirement
- [x] 2.3 Add `countdown(ms)` giving at most two units (`2h40m`, `1d7h`, `12m`); verify with tests for those three plus under one minute
- [x] 2.4 Add `bar(pct, marker?)` returning 8 eighth-block cells with the marker cell as `│`; verify with tests for 0%, 23.4%, 100% and a marker at 75%
- [x] 2.5 Keep `resets_at` on `weekly_scoped` in `parseUsage` and add `resetsAt?` to `Weekly` in `types/index.d.ts`; verify the existing `parseUsage` test extended with a reset time passes and `claude plugin validate plugins/session-bar` is clean

## 3. Pills, palette and layout

- [x] 3.1 Add one slate pill palette where every visible pill run sets its own text color (replaces a theme-read dark/light pair that failed on the `auto` theme); verify with a test that every visible run inside a pill carries a `color`
- [x] 3.2 Add pure `segments(input, tier)` building pill runs (dir, model, ctx with `󰕠`, 5h, 7d, per-model weekly, cache) for the tiers full / no-countdown / no-bars / plain; verify with tests that full has caps, bars and countdowns, and plain matches today's `·`-separated text
- [x] 3.3 Add `layout(segments, columns)` choosing the first tier whose run lengths fit; verify with tests at widths that select each of the four tiers
- [x] 3.4 Rewrite the `ui.render` hook to draw `layout(...)` runs as `Text` spans using `bodyColumns`; verify the existing mount tests still find `skills`, `Opus 5.5`, `187K`, `23%`, `61%` and that no `ctx ` text exists

## 4. Live redraw

- [x] 4.1 Start `$.clock.every(60_000, …)` in `session.start` bumping a `tick` atom read by `ui.render` (a reload drops the old module's timers, per the engine reference, so none is cancelled by hand); verify with a test that advancing the clock 3 minutes moves the 5h countdown by 3 minutes

## 5. Cache pill

- [x] 5.1 On `session.measure` with `context` changed, read `apiUsage` and keep the last two ratios in an atom (declared in `types/index.d.ts`); verify with a test that a measure with `cache_read: 98, input: 2, cache_creation: 0` draws `cache 98%`
- [x] 5.2 Color the cache pill orange only when both kept ratios are below 50%; verify with tests for the spec's four cache scenarios

## 6. Ship

- [x] 6.1 Bump `plugin.json` to 0.6.0 and update its description; verify `claude plugin validate plugins/session-bar` and `claude plugin test plugins/session-bar` both pass
- [x] 6.2 Run a real session in Ghostty at full, ~110 and ~70 columns; verify each shows the expected tier and the calm/trouble colors match the spec

## 7. Line-gauge bars

- [x] 7.1 Rewrite `bar(pct, marker?)` to return half-cell heavy-line cells (`━ ╸ ╺ ┿`), each tagged used, remaining or tick; verify with tests for 0%, 23.4% → `━━╺━━━━━`, 30% → `━━╸━━━━━`, 100%, and 23% with a tick at 50% → `━━╺━┿━━━`
- [x] 7.2 Draw bar cells on the pill background only (used = pill text color, remaining = 40% mix from pill background toward it, tick = `#93C5FD`, or white on attention fills) and remove `track`, `fill` and `mark` from `PILL`; verify with a test that every bar run's background equals its pill's
- [x] 7.3 Bump `plugin.json` to 0.6.2; verify `claude plugin validate plugins/session-bar` and `claude plugin test plugins/session-bar` both pass

## 8. Rewrite after visual check

- [x] 8.1 Context as a share of the model window (store tokens and window; 50%/80% thresholds); verify with tests for 19% of 1M (plain), 62% (orange) and 85% of 200K (vermillion)
- [x] 8.2 Calm segments as plain terminal-colored text, attention as an orange/vermillion pill; remove the gray pill palette; verify with a test that a calm row sets no colors and every run in an attention pill sits on its fill
- [x] 8.3 Bars as 10 cells of `━`/`─` with a `╾` half step, pace tick removed; verify with tests for 0%, 20%, 23.4%, 25%, 100% and 5-cell 61%/65%
- [x] 8.4 Tiers full → no countdowns → 5-cell bars → no bars, model label `1M`; verify layout tests pick each tier and a rendered preview fits 130, 110 and 80 columns in light and dark
- [x] 8.5 Bump `plugin.json` to 0.7.0; verify validate and test pass

## 9. Context thresholds from research

- [x] 9.1 Color ctx at the lower of 150K / 50% of the window (warn) and 250K / 80% (hot), show `<tokens>/<window>` (e.g. `187K/1M`); verify with tests at the 1M and 200K boundaries and for 120K (plain), 187K (orange) and 170K of 200K (vermillion)
- [x] 9.2 Bump `plugin.json` to 0.7.1; verify validate and test pass, and the no-bars tier still fits 80 columns (78 measured)
- [x] 9.3 Cap only the hot threshold by the window (warn stays at 150K) so an auto-compact window reported as 200K cannot make the pill orange at 100K; bump to 0.7.2; verify with tests at the 200K-window boundaries
