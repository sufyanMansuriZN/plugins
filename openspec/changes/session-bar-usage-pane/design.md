# Design

## Context

The desktop branch of the `AbovePrompt` hook (`plugins/session-bar/hooks/register.tsx`) draws one non-interactive `Svg` per pill. `Svg` takes no press, and `isInteractive` flickered the bar on send and turn complete (0.14.4). A `Button` takes `onPress`, but its children can only be strings and `Text`, so it cannot hold a pill. The mod API has no call that opens the app's own ring popover. 0.15.0 opened the detail in a side pane (`$.ui.open`); on this Desktop the pane is tall, mostly empty and far from the pills, so the detail now draws inline in the band. See proposal.md.

## Goals / Non-Goals

**Goals:**
- A click on the Desktop bar shows the data the pills hide, near the pills, and tells a person whether they are using a quota fully at a safe pace.
- No new flicker.
- The terminal bar is unchanged.

**Non-Goals:**
- Reproducing the app's popover or opening it.
- Making the pills clickable, or relabelling them.
- A pane, a tick or legend, or interactive `Svg` anywhere.
- A context breakdown by category (`$.session.usage({ breakdown })` could feed one later).

## Decisions

1. **A separate button, not button pills.** The pills stay as 0.14.4 (`Svg`, no handlers) so the flicker fix is untouched, and one native `plain` `Button` sits after them, reading `Usage details`. Desktop draws a Button's `label` in place of its children, so a chevron child with a label never showed; the person then chose the text. On the narrowest bar it reads `⤢`: a Button holds only text, Unicode has no arrows-in partner for a collapse glyph, and an `Svg` laid over the Button (`position="absolute"`) drew a second icon rather than one. Alternative: replace pills with `Button` + `Text`. Rejected: loses the fill and icons, re-risks the flicker on every pill, and a pill's click is undiscoverable.

2. **Inline block, not a pane.** Pressing the button expands a block above the pills inside the same `AbovePrompt` tree. Alternative: keep the 0.15.0 pane. Rejected after a mockup review: the side panel is far from the pills and mostly empty. Cost: the composer moves down while the block is open.

3. **Open state is a session atom, `usageOpen`.** `onPress` flips it with `update`, which redraws the band once. It starts `false` each session (atoms are per session), so the block is collapsed on launch, and a `prompt.submit` hook collapses it (read first, as a write redraws), since no outside-click event exists. Alternative: remember it across sessions in `$.store`. Rejected: a detail view opened on demand should not reopen itself.

4. **Pace by shadow, not tick.** A quota is meant to be used up, so a tick reads as a limit to stay under, the opposite of the aim. A pale shadow behind the fill, as wide as the share of the window gone, shows spare room (shadow past the fill) or overspend (fill past the shadow) with no legend. The meter keeps the pill's status colors and track and stays a non-interactive `Svg`. Alternative: a second thin bar for time. Rejected: too crowded.

5. **A pace verdict and a cap time, not a raw note.** Pace is the existing 15-point rule (`paceBand`'s warn threshold): more than 15 points under the time gone is `Room to use more`, within is `On pace`, over is `Ahead of pace`. Color is for danger only, as on the pill; being under pace stays gray and says so in words. When ahead, and at least a tenth of the window has gone and something is used, the line gives the cap time: `(100 - used) / used x elapsed x window length`, shown in place of the reset because the reset is no longer the useful fact.

6. **Context scale is the ideal ceiling.** The meter runs to `ctxHot` (250K, or 80% of a smaller window), as the pill does, so a full meter means hot. The window size is a fact in the line, not the scale, so the bar and its text agree. The line reads `Ideal under 150K` (`CTX_WARN`), then `Past the ideal range`, then `Past <ceiling>, quality drops`. No shadow: context has no clock.

7. **Names are the app's, in the block only.** Rows read `Session limit`, `Weekly · all models` and `Weekly · <model>`, the wording of the app's own popover, so the block and the app agree. The pills keep `5h`, `7d` and the model name, and so does the terminal bar. Alternative: relabel everything. Rejected by the person: block only.

8. **Two rows per line, compact rows when narrow.** Rows lay out in a `Box` of two columns. Under ~520px (65 cells) a line holds one compact row: name (a fixed 34% column, truncated), meter and value on one line, the dim line under it, tighter gaps. One full row per line (3 lines each) made the block taller than the band, which then scrolled the pills out of view; the band has no sticky region, and scrolling the rows ourselves via `ui.scroll` needs the band's row units, which are unknown.

9. **Meter width by flex, not pixels.** The meter `Svg` has no `viewBox`: it is `width="100%"`, its rects are percentages and its border a 2px stroke clipped to the track, so the flex cell sets its width and nothing is stretched. A fixed `viewBox` stretched by `preserveAspectRatio="none"` distorted the round ends in a wide cell.

10. **One-row tiers, as the terminal's.** Desktop's `bodyColumns` is real: 33 cells in the narrowest window, 55 at the narrow transcript width, 95 by default, 161 at the widest, 8px each (measured against the pills' own widths at 55 and 161). `desktopTier` picks the richest of four tiers whose pills and button fit: labels drop first, then the button's name (`⤢`), then the icons, since a warning swaps a pill's hue for amber or red and two warning pills would otherwise look alike. Only 33 cells drops the icons.

11. **A hue per quota.** A calm quota's pill and meter take its own Okabe-Ito hue (5h blue, 7d green, a model purple), none near the amber and red that replace it when it needs attention; a calm context stays gray. This replaces "color means severity only", at the person's request.

12. **Pill values at regular weight.** At 500 or 700 the values drew wider once the block opened (the labels, at 400, never did); prefixed classes and per-Svg clip ids did not change it. Regular weight with the primary ink against the label's dim one fixed it.

13. **Redraw rule.** The block draws countdowns, so while it is open they count in `minuteKey`. With it collapsed Desktop draws no countdown, so the minute tick stays quiet there. Alternative: show only the reset clock time, which never goes stale. Fallback if the minute redraw flickers.

14. **Reset clock time from the local zone.** The time of day is formatted from `resetsAt` with local `Date` methods (`Tue 17:30` when the reset is not today); the mod sandbox follows the machine's zone (checked live, IST). The line shows `resets in <time left>` under a day, else the weekday and time.

## Spike results

- `$.ui.open` resolved `isPlaced: true` on Desktop (2026-10-12); the pane then worked and toggled (0.15.0). Superseded by the inline block.
- A native `Button` after the pills did not flicker over several prompts and turns, and its `onPress` fired (2026-10-12, user-observed). The pane with the button also did not flicker.
- 0.15.0 (pane) shipped to main; this revision replaces it.

## Risks / Trade-offs

- [A toggle redraws the whole band, pills included, once] → the pills are non-interactive `Svg`, which did not flicker on the 0.15.0 minute redraws; check live.
- [The block pushes the composer down] → it is collapsed by default; one press collapses it.
- [The projection is noisy early in a window] → hidden before a tenth of the window has gone.
- [The countdown's minute redraw flickers while open] → decision 13 fallback; none seen live.
- [8px per cell is measured on one machine and font size] → the tier at 55 cells has ~3px to spare, so a 5-character context value (`1.2M`) drops a tier there; nothing overlaps either way. Re-measure if a tier misfits.
- [At 33 cells the pills have no icons, so two warning pills look alike] → only the narrowest window; any wider keeps icons.

## Open Questions

- Does the desktop `AbovePrompt` prop set give a usable width? Answered: `bodyColumns` is reported on Desktop and follows the window and the transcript width, at 8px a cell (decision 10). The meters need no width at all (decision 9).
