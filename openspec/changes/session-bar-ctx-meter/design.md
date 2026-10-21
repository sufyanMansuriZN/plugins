# Design

## Context

`hooks/bar.ts` parsed `SessionContextUsage.percent` into `Ctx` `{ kind: 'percent' }` and drew `ctx <percent>%`, a badge from 70% and from 85%. A subagent's view used `{ kind: 'tokens' }`. The window meters already have an 8-cell `meter()` with half cells and a tick that joins the line (`TICK`). The research in `openspec/changes/archive/2026-10-03-session-bar-visual-redesign/research-context-size.md` found that quality, latency and cost follow the tokens sent, not how full the window is. It named 250K for 1M windows and 160K for 200K windows.

## Goals / Non-Goals

**Goals:**
- Show the context the same way as 5h and 7d: a meter, then the value.
- Show the tokens sent, not a share of the window.
- Mark one fixed context size to stay under, and badge the count past it.

**Non-Goals:**
- No meter scaled to a ceiling. A full meter is the whole window.
- No tick that moves, and no tick from a `min()` of a token count and a share of the window. The user asked for a fixed tick.
- No change to a subagent's view, which has no window.

## Decisions

**`Ctx` for the main view is `{ kind: 'window', tokens, window }`.** `parseContext` reads `tokens` and `window`. Both must be finite, and the window must be above 0. Else there is no ctx segment. The percent kind goes, because nothing reads it. A subagent keeps `{ kind: 'tokens', tokens }`.

**The tick is a table by window.** `CTX_TICKS` holds `[largest window, tick tokens]` rows: `[200_000, 160_000]`, then `[Infinity, 250_000]`. The first row whose largest window is at least the model's window gives the tick. Its cell boundary is round(tick / window × 8), the same rounding as the pace tick. A new window class is one row.
- *Why 250K.* Anthropic's length-split long-context scores are strong up to the 256K bin and clearly lower past it.
- *Why 160K.* A 200K window compacts at its edge, so 250K is never reached. 160K leaves room before compaction.

**The fill is tokens over the window.** `meter((tokens / window) × 100, tick)` draws it, so the half cells and the tick arms match the window meters.

**The badge starts at the tick.** The token count is a vermillion badge when tokens ≥ tick tokens, and plain below. The tick and the badge use the same token count, so they agree up to the meter's rounding.

**A window smaller than its tick has no tick.** With `/autocompact` the window can be under 160K. The tick would then stand past the meter's end, so it is left out. The badge rule stays the same, so the count is plain until it reaches the tick tokens.

**The ctx meter follows `DETAILS`.** `ctxSegment` takes the rung's `Detail`, as `windowSegment` does. On the rung with no meters, ctx is `ctx 60K`.

## Risks / Trade-offs

- [`ctx ╾─╂────── 60K` takes 11 more cells than `ctx 6%`] -> The meters go sooner on a narrow band: at 114 columns where they went at 103 before, for the repo `plugins`, the branch at 12 cells and a 1M model.
- [Whether `context.window` is the model's window or the user's `/autocompact` window is not verified] -> If it is the auto-compact window, the meter is full at the compaction point, which still reads right. The tick table then applies to that window.
- [The badge and the tick can differ by rounding] -> 240K on a 1M window rounds its fill to the tick's boundary with no badge. The count says the real number.

## Migration Plan

No release yet: version 3.1.0 is still unreleased and ships with `session-bar-pace-meter` and `session-bar-two-zones`. No state changes. Rollback is the previous release.
