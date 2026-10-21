# Design

## Context

`hooks/bar.ts` is a pure core: `segments(input, columns)` returns runs of `{ text, tone }`, and `hooks/register.tsx` maps tones to `Text` props. A window with a reset time and a known length was already colored against an even pace, but only to warn about running ahead.

## Goals / Non-Goals

**Goals:**
- Say whether each window is ahead of, on or behind the pace that spends 100% at the reset, and by how much in time.
- A meter that shows spend, overspend and unspent allowance at a glance.

**Non-Goals:**
- A forecast from recent burn rate. Pace is against an even schedule only.
- A meter for the context segment.

## Decisions

**Pace as data.** `pace(window, now)` returns `{ kind, mark, delta, byMs }` or null without a reset time or length. `mark` is where an even pace stands now, `delta` = percent − mark, `byMs` the gap as time. `byMs` is computed from whole milliseconds (`percent × length / 100 − elapsed`), so 18.67 points of 5h is exactly 56m.

**One table for presentation.** `PACE` maps each kind to its word and tone. The cell rule (plain, ahead tone, blue, dim by filled and before or past the mark) is a second small function, because it depends on the mark and not the kind.

**Detail ladder.** `DETAILS` lists meter and word, word only, bare. `segments` takes the first level whose gauges fit beside a git segment of up to 12 cells, else bare, then cuts git into the room left as before. A short branch is never cut to keep a meter.
- *Alternative: drop meters per window, 7d first.* More levels for little gain; the two windows read best alike.

**Tones.** `green` and `blue` join `Run['tone']`, drawn as the theme keys `success` and `suggestion`.

## Risks / Trade-offs

- [8 cells are 12.5 points each] -> A window on pace can show one yellow or blue cell. The word and the percent color carry the verdict; the meter shows the shape.
- [The example row is 37 cells wider] -> The ladder drops meters, then words, on narrow bands.
