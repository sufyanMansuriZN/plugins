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

**No color in the meter.** Used and half-used cells are in the default color, unused cells dim, whatever the pace. Used cells after the tick still show the overspend by where they stand, and the badge names it. Shading unused cells before the tick as allowance read as noise.

**The tick joins the meter.** It is one more glyph, inserted at its boundary, so a paced meter is 9 glyphs. Its arms come from a 3 × 3 table (none, light, heavy). The left arm is heavy only when the left cell is `━`, since `╾` is light on its right side. The right arm is heavy when the right cell is `━` or `╾`. There is no arm at an end. The tick is in the default color.

**Color only as a badge background.** `bar.ts` has one way to color a run, `alert(text, tone)`. A plain tone gives the text as it is. Any other tone gives the text padded with a space on each side and `badge: true`, and `register.tsx` draws it as black bold text on the tone's color. No run outside a badge has a color tone, so no colored glyph lands on the terminal's own background.
- *Why.* A colored glyph's contrast depends on the theme's background, which the plugin does not know. Orange `#E69F00` text on white is about 2.3 : 1, far under the 4.5 : 1 that text needs. Black on a fixed color does not depend on the background.
- *Alternative: theme color keys for text.* They follow the theme, but give up the fixed Okabe-Ito set and leave the contrast to each theme.

**The badges.** A paced window's percent is plain. A dim space and the pace word follow it as a badge. A window without a pace (the spend limit) badges its percent from 50% (yellow) and 80% (red). The context percent is a badge from 70% (yellow) and 85% (red). Below those marks, the percent is plain.

**Fixed Okabe-Ito colors.** Yellow is `#E69F00` (orange), red `#D55E00` (vermillion), blue `#56B4E9` (sky blue). The Okabe-Ito set stays apart for the common color vision deficiencies, and orange and vermillion also differ in lightness. Black on each is 9.3, 5.4 and 9.1 : 1. Fixed hexes, not theme keys, keep that contrast the same in light and dark themes. The theme's `warning`, `error`, `success` and `suggestion` keys and the `green` tone go.

**No reset mark.** The countdown follows the percent or the badge after one space, on both surfaces: `66% 46m`. A first build put a Nerd Font refresh icon (U+F021) before it on the terminal and `↻` on the desktop. The person found that the mark only took cells, so it went, with the per-surface choice in `register.tsx`.

**Three widths.** `segments` tries the gauges with meters and badges, then with badges only, then bare, and takes the first that fits beside a git segment of up to 12 cells. It then cuts git into the room left as before. A short branch is never cut to keep a meter.
- *Alternative: drop meters per window, 7d first.* More levels for little gain; the two windows read best alike.

## Risks / Trade-offs

- [8 cells are 12.5 points each] -> A window on pace can show a used cell just past the tick. No cell is in color, so it does not read as an alert, and on pace there is no badge.
- [Overspend cells are no longer in color] -> They show the overspend only by their place after the tick. The badge carries the alert.
- [A bare countdown such as `46m` next to a percent] -> It reads as a time by its unit, and it is dim.
- [The tick rounds to a boundary] -> It is up to 6.25 points from the true mark. The badge uses the exact mark.
- [A background color on a terminal] -> Some terminals draw it with fewer colors. The word still reads.
- [The example row is about 30 cells wider] -> The row drops the meters, then the badges, on narrow bands.
