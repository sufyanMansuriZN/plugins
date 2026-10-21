# Proposal

## Why

The person wants to use all of each usage window by its reset: 100% of 5h when 5h resets, 100% of 7d when 7d resets. Today a window only turns yellow or red when it runs ahead of an even pace. A calm `5h 66% ↻46m` hides that part of that window will go unused. The row also gives no picture of how much is spent, only a number.

## What Changes

- Each usage window gets an 8-cell meter between its label and its percent. A filled cell (`━`) is used, an empty cell (`─`) is not.
- A window with a reset time also gets a tick (`┃`) in its meter, at the cell boundary nearest an even pace through the window: `5h ━━━━━──┃─ 66% ↻46m`. The pace counts around the clock, for 5h and 7d alike.
- Filled cells after the tick are overspend: yellow, red when more than 20 points ahead. Empty cells before the tick are allowance still to use: blue. Within 5 points of an even pace, the meter shows neither.
- The percent takes the pace's color: green on pace, blue behind, yellow ahead, red when more than 20 points ahead or used up. The old rule (yellow over 15 ahead, red over 30 ahead or from 90%) goes.
- The spend limit keeps its 50%/80% colors and gets a meter with no tick.
- When the band is narrow, the git segment is cut to 12 cells first, then the meters go. The gauges are still never cut.
- Version 3.1.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the usage windows show a meter with a pace tick, colored against the goal of 100% at the reset, and the row drops the meters before it would cut a gauge.

## Impact

- `hooks/bar.ts` (pace, meter, tick), `hooks/register.tsx` (two new tones), both test files.
- `plugin.json`, the root `README.md` and the plugin README carry 3.1.0 and the new row.
- No new state, events or permissions.
