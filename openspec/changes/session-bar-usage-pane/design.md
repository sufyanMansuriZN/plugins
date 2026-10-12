# Design

## Context

The desktop branch of the `AbovePrompt` hook (`plugins/session-bar/hooks/register.tsx`) draws one non-interactive `Svg` per pill. `Svg` takes no press, and `isInteractive` flickered the bar on send and turn complete (0.14.4). A `Button` takes `onPress`, but its children can only be strings and `Text`, so it cannot hold a pill. The mod API has no call that opens the app's own ring popover. A pane (`$.ui.open`, drawn by a `ui.render` hook on `{ component: 'Pane' }`) is the one place a mod can draw a detail view. `$.ui.open` resolves `isPlaced: false` on a Desktop that places no panes. See proposal.md.

## Goals / Non-Goals

**Goals:**
- A click on the Desktop bar opens a detail view with the data the pills hide: reset times, pace, thresholds.
- No new flicker.
- The terminal bar is unchanged.

**Non-Goals:**
- Reproducing the app's popover or opening it.
- Making the pills clickable.
- Interactive `Svg` anywhere, including in the pane.

## Decisions

1. **Spike gates the build.** Two facts decide whether this ships: `isPlaced` on Desktop, and no flicker with a `Button` in the band. Task group 1 checks both with throwaway code; a fail ends the change and records the finding. Alternative: build the pane first and hope. Rejected: a pane that never places is wasted work.

2. **A separate `Usage` button, not button pills.** The pills stay as 0.14.4 (`Svg`, no handlers) so the flicker fix is untouched, and one native `Button` is added after them. If the button flickers, it is the only cause and can be removed. Alternative: replace pills with `Button` + `Text`. Rejected: loses the ring fill and icons, and re-risks the flicker on every pill.

3. **Button always drawn with the pills, dropped once a pane open says `isPlaced: false`.** The calm bar currently shows pills (see the "Desktop pills" requirement), so the button shows with them. Probing at `session.start` would open the pane unasked every session, so placement is learned from the first press: if `$.ui.open` answers `isPlaced: false`, a `noPanes` flag hides the button for the session. The spike showed `true` on this Desktop, so this only guards older ones.

4. **Pane drawn with non-interactive `Svg` meters plus `Text`.** Each row: label, wide meter (fill = percent, tick = elapsed share), percent, countdown, reset clock time, pace note. The status colors and ink classes are reused from `pill`, so severity reads the same in the pane as on the pill. Alternative: `Text` bars with `━`. Rejected: the pane runs on Desktop, where the pills already use `Svg`, and a tick needs finer placement than a cell.

5. **Toggle by pane state.** The `ui.press` handler for the button reads `$.ui.panes()`: if `usage` is open it calls `$.ui.close`, else `$.ui.open`. No extra state to keep in sync.

6. **Pane redraws on the same triggers as the bar.** It reads the same atoms (`limits`, `weekly`, `ctx`) and `tick`, so it follows the bar's rule: a minute tick bumps `tick` only when a pace band or on-screen countdown changed. The pane draws a countdown, so its on-screen text is part of `minuteKey` while it is open. Alternative: drop the countdown and show only the reset clock time, which never goes stale. Rejected as default: the countdown is what the person reads at a glance; fall back to clock time only if the minute redraw flickers.

7. **Reset clock time from the engine's clock and the local zone.** `$.clock.now()` is the time source; the time of day is formatted from `resetsAt` in the local zone (`Tue 17:30` when the reset is not today).

## Spike results

- 1.1: `$.ui.open` resolved `isPlaced: true` on Desktop (2026-10-12, read from the probe mod's line beside the button).
- 1.2: a native `Button` after the pills in the desktop band did not flicker over two prompts and their turns (2026-10-12, user-observed; the pills were session-bar's 0.14.4 `Svg`s; a press raised the probe's toast, so `onPress` works on Desktop). 1.3 does not apply: both gates passed, so the build continues.

## Risks / Trade-offs

- [Desktop places no panes] → the spike finds it first; the change is archived with that finding and no code ships.
- [A `Button` in the band flickers like interactive `Svg`] → the spike finds it first; fall back to a `Link` (anchor) or drop the change.
- [A pane draws above the prompt or takes space the person wants] → check placement and size live; the person closes it with the button or the pane's own close mark.
- [The pane's countdown redraw flickers] → decision 6 fallback.
- [`Button` chrome clashes with the pills' look] → check live; use `plain` or a `variant` if it does.
