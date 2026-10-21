# Design

## Context

`hooks/bar.ts` is a pure core: `segments(input, columns)` returns runs of `{ text, tone, badge? }`, and `hooks/register.tsx` maps tones to `Text` props. A window with a reset time and a known length was already colored against an even pace, but only to warn about running ahead.

## Goals / Non-Goals

**Goals:**
- Show whether each window is ahead of, on or behind the pace that spends 100% at the reset.
- A meter that shows spend and overspend at a glance, with the even pace marked in it.
- Meaning that does not depend on telling colors apart, in light and dark themes.

**Non-Goals:**
- A forecast from recent burn rate. Pace is against an even schedule only.
- A gap in time ("2h ahead"). The badge and the tick carry the pace.
- Working hours. The pace counts around the clock for 5h and 7d.
- A meter for the context segment.

## Decisions

**Pace as data.** `pace(window, now)` returns `{ kind, delta, tick }` or null without a reset time or length. `mark` = elapsed / length × 100, `delta` = percent − mark, `tick` = round(mark / 12.5), a cell boundary from 0 to 8. Kinds: used up at 100% or more, on pace within 5 points, else ahead or behind.

**One table per kind.** `PACE` maps each kind to its word and tone: ahead to `ahead` or `far ahead` (more than 20 points) in yellow or red, behind to `behind` in blue, used up to `used up` in red, on pace to no word.

**Half cells.** The meter counts halves = round(percent / 100 × 16). A cell with both halves is `━`, with one half `╾` (heavy on its left), with none `─`. Eight cells stay 12.5 points each, but the fill reads to 6.25 points.

**Cells against the tick, not the mark.** Cell i's center is at or below the mark exactly when i < tick, so the cell rule reads the tick only. A used cell at or after the tick takes the kind's tone. Unused cells are dim on both sides of the tick: shading unused cells before it as allowance read as noise. On pace, every cell is default or dim.

**The tick joins the meter.** It is one more glyph, inserted at its boundary, so a paced meter is 9 glyphs. Its arms come from a 3 × 3 table (none, light, heavy). The left arm is heavy only when the left cell is `━`, since `╾` is light on its right side. The right arm is heavy when the right cell is `━` or `╾`. There is no arm at an end. The tick is in the default color.

**The badge.** A paced window's percent is plain. A dim space and the word, padded with a space on each side, follow it. The run has `badge: true`, and `register.tsx` draws it as black bold text on the tone's color.

**Fixed Okabe-Ito colors.** Yellow is `#E69F00` (orange), red `#D55E00` (vermillion), blue `#56B4E9` (sky blue). The Okabe-Ito set stays apart for the common color vision deficiencies, and orange and vermillion also differ in lightness. Black on each is 9.3, 5.4 and 9.1 : 1. Fixed hexes, not theme keys, keep that contrast the same in light and dark themes. The theme's `warning`, `error`, `success` and `suggestion` keys and the `green` tone go.

**Three widths.** `segments` tries the gauges with meters and badges, then with badges only, then bare, and takes the first that fits beside a git segment of up to 12 cells. It then cuts git into the room left as before. A short branch is never cut to keep a meter.
- *Alternative: drop meters per window, 7d first.* More levels for little gain; the two windows read best alike.

## Risks / Trade-offs

- [8 cells are 12.5 points each] -> A window on pace could show one colored cell the plain percent calls fine. On pace, the meter draws only the default color and dim.
- [The tick rounds to a boundary] -> It is up to 6.25 points from the true mark. The badge uses the exact mark.
- [A background color on a terminal] -> Some terminals draw it with fewer colors. The word still reads.
- [The example row is about 30 cells wider] -> The row drops the meters, then the badges, on narrow bands.
