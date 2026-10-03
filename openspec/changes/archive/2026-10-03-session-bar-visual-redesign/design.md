# Design

## Context

`plugins/session-bar/hooks/register.tsx` draws one `AbovePrompt` row from atoms (`limits`, `weekly`, `ctx`) that `session.start`, `session.measure` and `turn.complete` fill. Drawing is pure: `ui.render` only reads atoms. Colors use the Okabe-Ito palette (`#E69F00` orange, `#D55E00` vermillion). The terminal `AbovePrompt` band offers `Box`/`Text` (with `backgroundColor`), `Raster`, `bodyColumns` (band width) and `$.clock.every`. The target terminal is Ghostty with truecolor and built-in Nerd Font glyphs. Requirements are in `specs/session-bar/spec.md`.

## Goals / Non-Goals

**Goals:**
- Keep drawing pure and cheap: every new figure is computed in pure helpers that tests can call directly.
- One row, terminal-first; desktop draws the same tree.

**Non-Goals:**
- `Svg` pills on desktop, hover/click, a non-Nerd-Font fallback.

## Decisions

**Calm is plain text; only attention is a pill.** Calm segments draw in the terminal's own colors (labels dimmed), so they read on any theme, including `auto`, which a mod cannot resolve to light or dark. A segment needing attention becomes a pill: rounded caps `` `` in the fill color around runs on an orange (`#E69F00`) or vermillion (`#D55E00`) fill with `#191919` text, readable on both light and dark terminals. Pills are `Text` spans, not `Raster`, which is a fixed-size leaf. Tried first and rejected after use: a neutral gray pill on every segment. It needed explicit colors on every run to survive light themes (a theme-read dark/light pair failed on `auto`), and seven pills made the row busy, while color-only-on-attention makes the pill shape itself the alert.

**Bars are weight, not color: `━` used, `─` left, `╾` between.** 10 cells, one per 10%, at half-cell steps, so the length maps to the number beside it. The used and remaining parts differ in stroke weight, so the bar reads in plain terminal colors and inside an attention pill without any extra color. Ghostty draws U+2500–U+257F itself as pixel-aligned sprites, so the strokes join cell to cell in any font. History: eighth blocks on a dark track read as a box inside a box; a heavy line in two tones on a gray pill read better, but its pace tick `┿` was taken for the usage mark ("the vertical line and the bar percentage don't match"). The tick was dropped: pace still drives the colors, and the bar shows only usage. Findings and sources: `research-tui-bars.md`.

**Context is colored by tokens sent, shown against the window.** Quality, latency and per-request cost track the tokens sent, not how full the window is, so the color uses absolute thresholds: orange at 150K (the API's default compaction trigger, which Anthropic justifies by quality degrading as a conversation grows) and vermillion at 250K (past which Anthropic's length-split long-context scores drop). Only vermillion is capped, at 80% of the window, so a 200K window (a 200K model, or the auto-compact window if the engine reports that instead) turns vermillion at 160K, before it compacts. Orange is not capped: with a ~60K fixed baseline, half of a 200K window would fire after a few file reads. The text is `187K/1M` rather than a percentage, so an orange pill never sits beside a small-looking number; the bar shows the share of the window. History: a fixed 300K ceiling for the bar (unclear what the bar measured), then 50%/80% of the window (on a 1M model, no warning until 500K). Findings and sources: `research-context-size.md`.

**Segments are data first, JSX last.** A pure `segments(input, tier)` returns `{ text, style }` runs. `layout(input, columns)` tries tiers in order (full → no countdowns → 5-cell bars → no bars) and keeps the first whose run lengths sum to at most `bodyColumns`, else the last. All glyphs are single-cell, so string length is cell width. Measured on a typical row: 138, 122, 102 and 78 columns. The 1M model label is `Opus 5.5 1M` rather than `(1M context)` so the last tier fits 80 columns. Alternative considered: fixed column breakpoints, rejected because the real width depends on directory and model name lengths.

**Pace math is one pure helper.** `elapsed(resetsAt, windowMs, now) = clamp(1 - (reset - now) / windowMs, 0, 1)`, with window lengths `{ five_hour: 5h, seven_day: 7d }` and 7d for per-model weekly. `paceBand(pct, elapsed)` replaces `band` for windows with a reset time. `band` stays as the fallback for windows without one, and for the plain tier.

**Per-model weekly keeps its reset time.** `parseUsage` currently drops `resets_at` on `weekly_scoped`; `Weekly` gains `resetsAt?` so Fable gets pace and a countdown like 7d.

**Cache ratio comes from the context breakdown.** On `session.measure` with `context` in `changed`, call `$.session.usage({ breakdown: 'summary' })` and read `context.breakdown.apiUsage`. The ratio is `cache_read / (input + cache_read + cache_creation)`. `summary` estimates locally and sends no requests. State keeps the last two ratios; the pill is orange only when both are below 50%. One rule covers every expected miss (first reply, `/compact`, an idle gap past the cache's lifetime) without detecting each. The alternative, detecting starts, compactions and gaps one by one, was rejected: it needs three signals and misses causes nobody listed. If `apiUsage` is null, the pill stays hidden.

**A minute tick drives redraws.** `session.start` starts `$.clock.every(60_000, …)`, which bumps a `tick` atom. `ui.render` reads `tick` and `$.clock.now()`, so countdowns and pace move while idle. The tick only changes a number, so a redraw costs one pure render.

## Risks / Trade-offs

- [`breakdown: 'summary'` may be slower than expected or `apiUsage` may be null in practice] → First task is a spike that logs both after one turn. If it fails, the cache pill is dropped from the change, not worked around.
- [A hot reload could leave the old minute timer running] → Resolved: the engine drops a module's timers when it reloads it, so no cancel is kept.
- [Nerd glyphs render as boxes on machines without them] → Accepted for this change; a `userConfig` fallback is a follow-up.
- [The pace rule flags heavy use early in a window, e.g. 20% of 5h in its first 10 minutes] → Intended: that is a burn rate that will hit the cap.

## Migration Plan

Version bump in `plugin.json` (0.5.3 → 0.6.0). Stored `limits`/`weekly` keep their shape (`resetsAt` is optional), so readings stored by 0.5.x load unchanged. Rollback is reinstalling 0.5.3.
