# Proposal

## Why

The Desktop pills (0.14.3) still flicker when a prompt is sent and when a turn completes. The per-minute flicker is fixed; this one is not. The cause is a hypothesis, not confirmed: each pill is an interactive `Svg` (`isInteractive`, for the hover card), and Desktop may rebuild it on every `AbovePrompt` re-render, such as the `isWorking` flip on send and the state writes on `turn.complete` and `session.measure`.

Separately, `refreshUsage` writes `fetchedAt` to `$.state` every 5 minutes. Nothing on screen reads it, but a state write redraws the bar.

## What Changes

- **Experiment (0.14.4):** drop `isInteractive` from the pills only. Then watch whether the flicker stops on send and on turn complete. This is a test of the hypothesis, not yet a decision to remove hover.
- **If the flicker stops:** decide how to trade hover for a steady bar, and whether the countdown stays reachable some other way. Update the hover requirement to match.
- **If it does not stop:** restore `isInteractive` (hover and countdown back as in 0.14.3) and record that Desktop re-renders regardless of the pills.
- **Always:** stop writing `fetchedAt` to `$.state`. The 5-minute gate reads and writes `$.store` only, so a fetch that changes nothing on screen causes no redraw.
- Terminal output is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the redraw requirement now covers fetch bookkeeping. The hover requirement may change after the experiment; its delta is written in task 3, once the result is known.

## Impact

- `plugins/session-bar/hooks/register.tsx`: `Svg` loses `isInteractive` for the experiment; `refreshUsage` drops the `fetchedAt` atom and gates on `$.store`.
- `plugins/session-bar/hooks/register.test.ts`: a test for the bookkeeping write; a pill test that tracks the experiment.
- `plugins/session-bar/.claude-plugin/plugin.json`: version 0.14.4.
- `openspec/specs/session-bar/spec.md`: redraw requirement now; hover requirement after the result.
- Cannot be fully verified in tests: the flicker shows only in the live Desktop app. The user judges it by eye.
- Open work: `session-bar-desktop-icons` (3.2 flicker check, 5.2, 6.2) overlaps this. Task 3.2 there is the same symptom.
