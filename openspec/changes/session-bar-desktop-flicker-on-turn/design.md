# Design

## Context

`register.tsx` (0.14.3) draws the Desktop pills in the `AbovePrompt` render hook as `<Svg ... isInteractive />`, one per badge. `isInteractive` is what gives the pill its hover card. A re-render of `AbovePrompt` comes from any `$.state` write (`update()` always writes, even for an equal value) and from engine events such as the `isWorking` flip on send. The `turn.complete` and `session.measure` handlers already skip equal readings, so on a turn the writes that remain are real changes plus the `fetchedAt` write in `refreshUsage`.

`fetchedAt` is an atom in `$.state` and also a key in `$.store`. Only `refreshUsage` reads the atom, to gate the 5-minute fetch. The render hook never reads it, yet its write redraws the bar.

See proposal.md for the symptom. The cause of the send and turn flicker is unconfirmed.

## Goals / Non-Goals

**Goals:**
- Learn whether `isInteractive` causes the flicker on send and turn complete, with the smallest code change.
- Remove the redraw that bookkeeping causes every 5 minutes.
- Leave the terminal bar untouched.

**Non-Goals:**
- Fixing a flicker that the experiment shows comes from Desktop itself. That outcome is recorded, not worked around.
- Replacing hover with a new surface. That is decided only if the experiment succeeds.
- Changing pill look, thresholds or layout.

## Decisions

1. **Experiment first: remove `isInteractive` from the pills only.** One prop, one release (0.14.4), a clear yes/no from the user's eyes. Alternative: memoize or stabilize the `Svg` props so a rebuild is a no-op. Rejected for now: the `Svg` element is created by the host, so the hook cannot control its identity, and it would be a guess on top of a guess.

2. **The tip stays as `alt`.** The pill keeps `alt={badge.tip}`, so the text is still in the element for assistive tech even if the hover card goes. Whether `alt` shows as a native tooltip on Desktop is not known; the check in task 2 notes it.

3. **Decision tree after the result.** The user reports flicker on send and on turn complete, separately.
   - Both stop: hover is the cause. Choose between (a) a steady bar with no hover, accepting the loss of the countdown, (b) keep hover on the 5h pill only, if one interactive element is enough to stay steady, or (c) a non-hover way to reach the countdown. The choice is the user's and goes in a follow-up delta to "Desktop pill hover".
   - Only one stops: keep the experiment off and record which event still redraws.
   - Neither stops: restore `isInteractive`, revert the version bump or ship 0.14.4 as the restore, and record that Desktop re-renders regardless.

4. **Drop the `fetchedAt` atom; gate on `$.store`.** `refreshUsage` reads `$.store.get('fetchedAt')` and sets it, and no `$.state` write happens. `$.store` already claims the window across sessions, which is the stated reason for the existing `store.set`. Alternative: keep the atom and skip the write when the value is equal. Rejected: the value changes each time, so it would still redraw, and a second copy of the same fact is the bug.
   - The first fetch of a session is `force`d in `session.start`, so a missing store value (first ever run, or a cleared store) reads as 0 and behaves as today.
   - Overlap: two `turn.complete` handlers in the same instant can both read the store before either sets it, the same window the current code has between its `read` and `update`. Not made worse.

5. **Tests cover what is testable.** The flicker is not testable. The bookkeeping write is: after a refresh the redraw count does not rise by the `fetchedAt` write. Use the existing `ui.findAll`/render-count helpers in `register.test.ts` if they can count renders, otherwise assert `$.state` has no `fetchedAt` key.

6. **Always show readings.** `desktopSegments` ends with `all.some(x => x.level) ? all : []`; it returns `all`. The Desktop branch of `ui.render` then no longer falls through to `next(e)` alone when calm. Calm pills already have a neutral look (a white chip track and gray fill), so no styling changes. An absent reading yields no badge today (`b.ctx` unset, an expired window dropped by `fresh`), so skipping follows without new code. Alternative: a force-show env switch for the test only. Rejected: the user wants the bar always visible, not only under test.
   - The minute tick already redraws on a pace-band change, so it is unaffected.

## Risks / Trade-offs

- [The bar is always on screen, so any redraw is more noticeable] → That also makes the flicker check in task 2.3 possible, since there is always a pill to watch.

- [Removing `isInteractive` loses hover and the reachable countdown] → The experiment is reversible in one line, and the spec's hover requirement is not edited until the result is known.
- [The flicker may not come from `isInteractive` at all] → Step 3 of the decision tree records that and restores hover. The result is still useful.
- [The user can only judge by eye, on Desktop, after a restart] → Task 2 lists exactly what to do and what to report. It needs `claude plugin update session-bar` and a Desktop restart.
- [Spec delta can go stale if the experiment succeeds] → Task 3 is explicit about writing the hover delta before archive.

7. **Result of the experiment (0.14.4, hot-swapped).** With `isInteractive` removed from every pill, the user saw no flicker on send and none on turn complete, and no hover. So the interactive pills are the cause. Desktop shows nothing for `alt`. Chosen branch: hover on the 5h pill only (option b of decision 3), because the countdown is the only content not already on a pill. The other pills have no hover.
   - **Second result:** with hover on the 5h pill only, that pill flickered on send. One interactive pill is enough, so the fix is no interactive pill (option a). The spec delta removes "Desktop pill hover" and adds "Desktop pills are not interactive". The countdown has no Desktop home now. Ideas for later, not decided: a text note in the pill that does not change each minute (such as the reset clock time), or a hover on something that is not redrawn.

## Open Questions

- None.
