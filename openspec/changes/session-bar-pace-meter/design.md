# Design

## Context

`hooks/bar.ts` is a pure core: `segments(input, columns)` returns runs of `{ text, tone }`, and `hooks/register.tsx` maps tones to `Text` props. A window with a reset time and a known length was already colored against an even pace, but only to warn about running ahead.

## Goals / Non-Goals

**Goals:**
- Show whether each window is ahead of, on or behind the pace that spends 100% at the reset.
- A meter that shows spend, overspend and unspent allowance at a glance, with the even pace marked in it.

**Non-Goals:**
- A forecast from recent burn rate. Pace is against an even schedule only.
- A pace word or a gap in time. The tick and the colors carry the pace.
- Working hours. The pace counts around the clock for 5h and 7d.
- A meter for the context segment.

## Decisions

**Pace as data.** `pace(window, now)` returns `{ kind, delta, tick }` or null without a reset time or length. `mark` = elapsed / length × 100, `delta` = percent − mark, `tick` = round(mark / 12.5), a cell boundary from 0 to 8.

**Cells against the tick, not the mark.** Cell i's center is at or below the mark exactly when i < tick, so the cell rule reads the tick only. A colored cell can never sit on the wrong side of the tick.

**One table for the percent's tone.** `PACE_TONE` maps each kind to its tone. The cell rule (default, ahead tone, blue, dim by filled and before or after the tick) is a second small function, because it depends on the tick and not the kind alone.

**The tick is one more glyph.** It is inserted at its boundary, so a meter with a pace is 9 glyphs and a meter without one is 8. The tick is in the default color, so it reads against yellow, red, blue and dim cells.

**Two widths.** `segments` shows the meters when the gauges fit beside a git segment of up to 12 cells, else the bare gauges, then cuts git into the room left as before. A short branch is never cut to keep a meter.
- *Alternative: drop meters per window, 7d first.* More levels for little gain; the two windows read best alike.

**Tones.** `green` and `blue` join `Run['tone']`, drawn as the theme keys `success` and `suggestion`.

## Risks / Trade-offs

- [8 cells are 12.5 points each] -> A window on pace could show one yellow or blue cell the green percent calls fine. On pace, the meter draws only the default color and dim.
- [The tick rounds to a boundary] -> It is up to 6.25 points from the true mark. The percent's color uses the exact mark.
- [The example row is 20 cells wider] -> The row drops the meters on narrow bands.
