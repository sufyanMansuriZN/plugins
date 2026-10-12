# Tasks

## 1. Countdown off the bar

- [x] 1.1 Remove `after` from `Badge`, `desktopSegments` and `pill` (and its width term in `pill`). Keep the countdown in `tip`. Verify: tests show the 5h pill source has no `4h13m` while its `tip` still reads `resets in 4h13m`.
- [x] 1.2 Add `countdowns: boolean` to `minuteKey`; in the tick, read `$.session.surfaces()` and pass whether it includes `terminal`. First confirm `surfaces()` and its return value against the engine types. Verify: tests show a countdown-only change gives the same key when `countdowns` is false and a new key when true, and a pace-band change gives a new key either way.

## 2. Pill with icon and fill

- [x] 2.1 Add `kind: 'ctx' | '5h' | '7d' | 'model'` to `Badge`, set in `desktopSegments` (`5h` and `7d` by label, other weekly labels are `model`). Verify: a test maps ctx, 5h, 7d and a `Sonnet` window to the four kinds.
- [x] 2.2 Rework `pill`: remove the ring; draw the clipped fill rect to `share`% (neutral gray at 0.20, tinted its accent at 0.35); draw the 18px icon at stroke 1.5, 12px from the left, text 7px after it. Add a `GLYPH` table for the four icons and the color table from design decision 3, with dark-mode classes. Verify: tests find the fill width per share, four different icon paths, the icon color per kind (neutral and tinted), and a pill width that fits label and value.
- [x] 2.3 Run the full test file and `tsc --noEmit`. Verify: both pass, and the terminal tests are unchanged.

## 3. Release

- [ ] 3.1 Bump `plugin.json`, commit and push after the user's go-ahead, update the plugin, restart Desktop. Verify on screen in light and dark: icons are drawn correctly and unclipped, the fill reads as the share, text has even padding, and hover shows the countdown. Adjust any icon path that reads badly.
- [ ] 3.2 Leave the bar open for several minutes. Verify: the user reports no flicker each minute; if it persists, record which event still redraws it.

## Workflow follow-up

- Release and archive `session-bar-desktop-surface` first (its task 6.2 is open), then archive this change.
