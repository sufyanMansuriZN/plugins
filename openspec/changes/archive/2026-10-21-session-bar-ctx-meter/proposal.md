# Proposal

## Why

The ctx segment shows a percent of the model's window, and it turns orange at 70% and vermillion at 85%. On a 1M window, 70% is 700K tokens. Long-context scores drop well before that, past about 256K (`openspec/changes/archive/2026-10-03-session-bar-visual-redesign/research-context-size.md`). So the badge comes far too late on a 1M model, and the percent does not say how many tokens each request sends. The 5h and 7d windows have a meter, and ctx does not.

## What Changes

- In the main view, ctx shows an 8-cell meter, the same as 5h and 7d. A full meter is the whole model window.
- The token count (`60K`, `1M`) takes the place of the percent.
- A fixed tick marks the context size to stay under: 250K on a window above 200K, and 160K on a window of 200K or less. Its place is the tick tokens over the window, at the nearest cell boundary.
- From the tick, the token count is a vermillion badge. Below it, the count is plain. The 70% and 85% badges go.
- On a narrow band, the ctx meter goes at the same step as the window meters.
- A subagent's view is unchanged: the token count, with no meter, tick or badge.
- Same on the terminal and the desktop surfaces. Version stays 3.1.0, which is not yet released.

Builds on `session-bar-two-zones` and `session-bar-pace-meter`, which are not archived yet. This change's blocks for One row above the prompt and Row fits the terminal start from the two-zones text. Its Context segment and Limits parsed at the boundary blocks start from the pace-meter text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the context segment reads the token count (Context segment), the row's examples and narrow-band widths change (One row above the prompt, Row fits the terminal), and the boundary parse reads tokens and window (Limits parsed at the boundary). New requirements add the context meter, its tick and its badge (Context meter, Context tick, Context badge).

## Impact

- `hooks/bar.ts` (the `Ctx` shape, `parseContext`, the tick table and the ctx segment), both test files. `hooks/register.tsx` does not change.
- The plugin README describes the ctx meter, the tick and the new badge.
- No new state, engine calls or permissions.
