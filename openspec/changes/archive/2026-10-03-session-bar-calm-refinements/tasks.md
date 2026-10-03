# Tasks

## 1. Remove cache

- [x] 1.1 Delete the `cache` atom, `cacheRatio`, `cacheBand`, `BarInput.cache`, the cache segment in `segments`, the `breakdown` call in `session.measure` and the cache read in `ui.render` (`register.tsx`), and `cache` from `PluginState` (`types/index.d.ts`); verify `grep -n cache plugins/session-bar` finds nothing in code and the type check passes
- [x] 1.2 Delete the "cache pill" and "cache pill fills from measure" tests and drop `cache` from the calm-segments test input; verify the remaining tests pass

## 2. Context bar and text

- [x] 2.1 Extract `ctxHot(ctx) = min(250_000, 0.8 × window)` and use it in `ctxBand`; verify the existing `ctxBand` threshold expectations still pass
- [x] 2.2 Draw the ctx bar on `tokens / ctxHot × 100` with the `┿` tick at `min(cells − 1, floor(150_000 / hot × cells))`, normal-colored inside the fill and dimmed outside it; add tests for every Context bar scenario in the delta spec (120K, 187.4K, 260K on 1M; 80K on 200K; 120K at 5 cells), and check the tick run's `dimColor`
- [x] 2.3 Change the ctx value to `tokensText(tokens)` alone; update the ctx pill tests to look up `187K`, `120K`, `180K`, `170K`, and verify they pass

## 3. Countdowns and tiers

- [x] 3.1 Extend `Tier` to 0–4: tier 0 shows every countdown, tiers 1–3 show only the 5h one (matched by `windowMs === WINDOW_MS.five_hour`), tier 4 shows none; `layout` tries 0–3 and falls back to 4; update the `Tier` comment
- [x] 3.2 Rewrite the "tiers and layout" test: tier 1 keeps ` 2h40m` and drops ` 1d7h`; tier 3 joins to `skills · Opus 5.5   ctx 120K   5h 23% 2h40m   7d 61%`; tier 4 to `skills · Opus 5.5   ctx 120K   5h 23%   7d 61%`; `layout(b, 10)` returns tier 4; verify it passes

## 4. Release

- [x] 4.1 Bump `plugin.json` to 0.8.0, drop "cache" from its description, and update the `cache` mention in the marketplace entry if there is one; verify the full test suite passes
- [x] 4.2 Reinstall the plugin and check in a live session that a calm bar shows the ctx tick, the 5h countdown and no cache segment, and that narrowing the terminal drops details in the spec's order

## 5. Window in the model label

- [x] 5.1 Give `modelLabel` an optional `window` that appends `tokensText(window)` (falling back to the `[1m]` hint when absent) and pass `ctx.window` from `ui.render`; add tests for the Model label scenarios in the delta spec, and check the mounted bar shows `Opus 5.5 1M` after a measure
- [x] 5.2 Bump `plugin.json` to 0.8.1, verify the full test suite passes, and reinstall the plugin
