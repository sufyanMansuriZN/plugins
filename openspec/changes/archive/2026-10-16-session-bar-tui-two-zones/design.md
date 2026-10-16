# Design

## Context

`segments(b, tier)` in `plugins/session-bar/hooks/register.tsx` returns one flat `Run[]`: groups (identity, ctx, cache, each window) joined by a dimmed ` · `, attention groups wrapped by `segment()` in caps on an `ATTN` fill with every run recoloured `ON_ATTN`. `layout(b, columns)` keeps the first tier whose `width()` fits `bodyColumns`, and the terminal render draws the runs as `<Text>` children of one `<Box>`. Secondary text is `dimColor` throughout. The approved look is concept F, previewed in Ghostty on light and dark themes (scratchpad `bar-preview.ts`, not in the repo). Builds on `session-bar-cache-cold-alarm`, whose `cacheRun` pills and cache-after-model order this change keeps as is.

## Goals / Non-Goals

**Goals:**
- Keep `segments` and `layout` pure and testable: the zones, slots and colours are all in the returned runs, and the render only places them.

**Non-Goals:**
- Desktop (`desktopSegments`, `pill`, the usage block) is untouched.
- No theme detection: the grey is chosen to read on both, not switched per theme.
- No new tiers or a new shedding order.

## Decisions

**`segments` returns two run lists, `{ left, right }`.** Left is the identity group plus the cache section; right is ctx and the windows. `layout` sums `width(left) + GAP + width(right)` with `GAP = 3` against `columns`, so the gap shrinks to its minimum before a tier is dropped, as the spec asks. The render draws a row `<Box>` holding the left zone in a `<Box flexGrow={1}>` and the right zone in a `<Box marginLeft={GAP}>`, which pins the right zone to the band's edge and keeps the minimum gap without padding computed from `bodyColumns` (absent in some mounts, where `layout` uses Infinity). Alternative: pad with a run of spaces of `columns - width(left) - width(right)`. Rejected: it needs a known width in the pure helper, and a resize between render and paint would leave the row too long.

**A calm segment carries the pill's cells as blanks.** `segment(level, runs)` returns `' ' + runs + ' '` when calm, and the same on the fill on attention, a square pill with no caps (rounded Powerline caps were tried live and dropped): both are `width(runs) + 2`, so a gauge turning into a pill moves nothing. Gauges are joined by one blank run, so calm gauges sit 3 cells apart. Bars are 5 cells at every tier, so the short-bars tier is gone. The cache pill in the left zone uses the same `segment`; a calm cache keeps the ` · ` separator instead (spec: Cache state in the terminal bar).

**Fixed slots by padding text.** `meter()` pads the value with `padStart(4)` and the countdown with `padEnd(5)`; every glyph is one cell, so `width()` stays exact. The 5h countdown only appears at tiers that draw it, so its slot goes with it and a tier change is the one time gauges move (spec: Gauges hold their columns).

**One grey replaces `dimColor`.** A `GREY = '#777777'` run colour stands in for every `dimColor: true` in the terminal runs (the Desktop path has its own colours and keeps them). Values get `bold: true`; the used part of a bar gets no colour, so it takes the terminal's text colour on either theme. Measured contrast: 4.48:1 on `#ffffff`, 3.72:1 on `#1e1e1e`. Alternatives: SGR dim (what fades on light themes today), or a light/dark pair (a mod cannot read an `auto` theme).

**The pill's bar shade comes from a run flag.** `segment()` recolours every run `ON_ATTN`, which would paint the remaining part of a bar the same as the used part. A run that is the bar's remainder (and the tick while it sits in the remainder) carries `rest: true`; `segment()` colours those `REST_ON[level]` (`#94690A` on orange, `#8A420A` on vermillion, from `research-tui-bars.md`) and the rest `ON_ATTN`. The render strips `rest` before spreading a run's style onto `<Text>`. Alternative: split `segment` into a gauge-aware variant. Rejected: one flag keeps one wrapper for cache, ctx and windows.

## Risks / Trade-offs

- [Fixed slots and blank padding make each gauge wider, so some terminals land on a lower tier] → Accepted: the tiers already exist for this, and the gauges then still hold their columns within a tier.
- [`#94690A` and `#8A420A` on their fills are about 2.2:1 and 1.9:1, so the remaining part of a bar inside a pill is faint] → Accepted: the used part (dark text colour) and the bold value carry the reading, as in the preview.
- [Heavy and light strokes differ little in some fonts, so on a light theme used vs remaining reads mostly by grey vs text colour] → Accepted; Ghostty's `adjust-box-thickness` thickens both.
- [The `GAP` in `layout`'s sum and the render's `marginLeft` drift apart, so a tier is picked that the row cannot hold] → One `GAP` constant feeds both, and a mount test at exactly the picked width checks the row does not wrap.

## Migration Plan

Version bump in `plugin.json` on release, after `session-bar-cache-cold-alarm` is archived and released. No stored state changes shape. Rollback is reinstalling the previous version.
