# Proposal

## Why

The person wants to use all of each usage window by its reset: 100% of 5h when 5h resets, 100% of 7d when 7d resets. Today a window only turns yellow or red when it runs ahead of an even pace. A calm `5h 66% ↻46m` hides that 56 minutes of that window will go unused. The row also gives no picture of how much is spent, only a number.

## What Changes

- Each usage window gets a pace word after its percent: `30m ahead` (runs out before the reset), `1h behind` (will leave usage unspent), `on pace` (within 5 points of an even pace) or `used up` (100% or more). The time is how far the percent is from an even pace, in the countdown's format.
- The percent and the pace word take the pace's color: green on pace, blue behind, yellow ahead, red when more than 20 points ahead or used up. The old rule (yellow over 15 ahead, red over 30 ahead or from 90%) goes.
- Each window gets an 8-cell meter between its label and its percent: `5h ━━━━━─── 66% 56m behind ↻46m`. Filled cells past the even pace are overspend (yellow or red). Empty cells before it are allowance still to use (blue).
- The spend limit keeps its 50%/80% colors and gets a meter but no pace word.
- When the band is narrow, the git segment is cut to 12 cells first, then the meters go, then the pace words. The gauges are still never cut.
- Version 3.1.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the usage windows show a pace word and a meter, colored against the goal of 100% at the reset, and the row drops that detail before it would cut a gauge.

## Impact

- `hooks/bar.ts` (pace, meter, detail ladder), `hooks/register.tsx` (two new tones), both test files.
- `plugin.json`, the root `README.md` and the plugin README carry 3.1.0 and the new row.
- No new state, events or permissions.
