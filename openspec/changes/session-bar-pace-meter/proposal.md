# Proposal

## Why

The person wants to use all of each usage window by its reset: 100% of 5h when 5h resets, 100% of 7d when 7d resets. Today a window only turns yellow or red when it runs ahead of an even pace. A calm `5h 66% ↻46m` hides that part of that window will go unused. The row also gives no picture of how much is spent, only a number.

## What Changes

- Each usage window gets an 8-cell meter between its label and its percent. A cell fills in halves: `━` is a used cell, `╾` a half-used cell and `─` an unused one.
- A window with a reset time also gets a tick in its meter, at the cell boundary nearest an even pace through the window: `5h ━━━━━╾─╂─ 66%  behind  ↻46m`. The tick joins the meter: each arm is heavy when the cell beside it is used on that side, so a fill that stops at the tick does not seem to pass it (`━━━━╉────`). The pace counts around the clock, for 5h and 7d alike.
- Used cells after the tick are overspend, shown by where they stand. No cell is ever in color: used cells and the tick are in the default color, unused cells dim.
- The percent stays in the default color. A badge after it names the pace: ` ahead `, ` far ahead `, ` behind ` or ` used up `, in black bold text on orange, vermillion or sky blue. On pace has no badge. The old rule (yellow over 15 ahead, red over 30 ahead or from 90%) goes.
- Color shows only as a badge's background. A colored glyph on the terminal's own background cannot keep its contrast in both themes: orange `#E69F00` text on white is about 2.3:1. Black text on a fixed color keeps the same contrast, 5:1 or more, in light and dark themes alike.
- The colors are fixed Okabe-Ito hexes, chosen to stay apart for the common kinds of color blindness. The word carries the meaning, so no one has to tell the colors apart.
- The spend limit gets a meter with no tick and no pace badge. Its percent becomes a badge from 50% (orange) and from 80% (vermillion), and stays plain below 50%.
- The context percent becomes a badge from 70% (orange) and from 85% (vermillion), in place of yellow and red text.
- On the terminal, the reset countdown starts with the Nerd Font refresh icon (U+F021), which sits in the center of its cell. Ghostty bundles the Nerd Font symbols. The desktop app keeps `↻`. A terminal font without Nerd Font symbols shows a box in its place.
- When the band is narrow, the git segment is cut to 12 cells first, then the meters go, then the badges. The gauges are still never cut.
- Version 3.1.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the usage windows show a meter with half cells and a pace tick, and a pace badge, against the goal of 100% at the reset. The row drops the meters, then the badges, before it would cut a gauge. Color shows only as a badge background, for the pace, the spend limit and the context. The terminal marks the reset with a Nerd Font icon.

## Impact

- `hooks/bar.ts` (pace, meter, tick, badges), `hooks/register.tsx` (fixed colors, badge drawing, the reset mark per surface), both test files.
- `plugin.json`, the root `README.md` and the plugin README carry 3.1.0 and the new row.
- No new state, events or permissions.
