# Design

## Context

Everything lives in `plugins/session-bar/hooks/register.tsx`. `bar(pct, cells)` returns `{ used, rest }` strings. `segments(b, tier)` builds the runs for tiers 0–3, and `layout` picks the richest tier that fits `bodyColumns`. The cache reading comes from a `session.usage({ breakdown: 'summary' })` call in `session.measure`, kept in a `cache` atom typed in `types/index.d.ts`. See proposal.md for motivation and the delta spec for the exact glyph sequences.

## Goals / Non-Goals

**Goals:**
- The ctx bar and the ctx color use one scale.
- The 5h reset countdown is the last detail to go.
- The code gets smaller: the cache path is deleted, not hidden.

**Non-Goals:**
- No change to `paceBand`, `ctxBand` thresholds, pill colors or the usage fetch.
- No right-aligned clusters, no fixed-width percentages (discussed, deferred).
- No "cache cold" hint on ctx. The cache lifetime per plan is unverified.

## Decisions

**ctx bar = `bar()` on a rescaled percentage, plus one cell swapped for the tick.**
`pct = tokens / hot × 100`, where `hot = min(250_000, 0.8 × window)`, the same expression `ctxBand` uses. Pull it into a shared `ctxHot(ctx)` so the bar and the color can't drift. The tick sits at cell `floor(150_000 / hot × cells)`, clamped to `cells − 1`. Replace that index in `used + rest`, then split again at `used.length`. A tick inside `used` gets the normal color, one inside `rest` gets dimmed, with no extra styling code. Alternative: a dedicated ctx bar function with its own glyph logic. Rejected because it would duplicate the half-cell rounding.

**The tick is the warn point, not the window share.** The tick is "stay under this line", which only makes sense for context. Usage windows get no tick, because their marker read as a limit and confused things.

**Tiers become 0–4.** 0 everything, 1 no weekly countdowns, 2 5-cell bars, 3 no bars, 4 no 5h countdown. `layout` tries 0–3 and falls back to 4. The 5h window is recognised by `windowMs === WINDOW_MS.five_hour`, not by its label, so a renamed label can't break it. `Win` already carries `windowMs`, so no new field is needed.

**ctx text is `tokensText(tokens)` only.** The `/window` suffix goes.

**The window moves to the model label.** `modelLabel(id, window?)` appends `tokensText(window)` once a context reading names the window, and falls back to the ID's `[1m]` hint before that. The ID alone does not carry it: sessions on a 1M window report a plain `claude-opus-5-5`. Every window size shows (`Haiku 4.5 200K`), not only 1M, so the label always says what the ctx scale runs against. Alternative: keep `/1M` on the ctx text. Rejected because it costs width in the segment that already carries a bar and a pill.

**Cache removal is total.** Delete the `cache` atom, `cacheRatio`, `cacheBand`, `BarInput.cache`, the `breakdown` call in `session.measure`, the read in `ui.render`, and `cache` in `PluginState`. Values stored in `$.store` under older versions are never read again, and the `cache` atom was never persisted, so there is nothing to migrate.

## Risks / Trade-offs

- [On a 200K window the warn tick lands in the last cell (150K of a 160K scale), so it nearly touches the end] → Accepted. It honestly shows how little room is left between warn and hot there.
- [`e.context.window` may report the auto-compact window rather than the model window (unverified)] → The scale follows whatever `window` is, and so does `ctxBand`, so bar and color still agree either way.
- [A 5h countdown in tier 3 widens the narrow form by about 6 columns] → Tier 4 exists for exactly that.

## Migration Plan

Bump the plugin to 0.8.0 and reinstall. Rollback is reinstalling 0.7.2. No stored state changes shape.
