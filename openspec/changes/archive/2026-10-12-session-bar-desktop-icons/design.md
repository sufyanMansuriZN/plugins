# Design

## Context

`desktopSegments` builds `Badge[]` (`label`, `value`, `after`, `share`, `level`, `tip`); `pill(badge)` returns one SVG per badge (ring at `cx=19`, text at `x=35`, 28px high). The 60s `$.clock.every` tick in `session.start` bumps `tick` only when `minuteKey` changes. `minuteKey` hashes each window's countdown text and pace band, so a countdown change redraws every minute. That redraw rebuilds the interactive `Svg` frames, which is the flicker. Both surfaces share this tick.

## Goals / Non-Goals

**Goals:**
- No minute-by-minute redraw on Desktop.
- Four segments tell apart without reading the text.
- Terminal unchanged.

**Non-Goals:**
- Changing the tints, the thresholds, the pace logic or the left/right layout.
- Live-updating the hover text between redraws.
- An icon font or image asset; icons are inline SVG paths.

## Decisions

1. **Drop `after` from `Badge` and `pill`.** The countdown is in `tip` already (`resets in 4h13m`). Removing the field removes its width term, so pills get narrower. Alternative: keep `after` and hide it with CSS. Rejected: the text change is what forces the redraw, and the source would still change each minute.

2. **Layout B: no ring; the pill itself is the meter.** A mockup review with the user chose this over rings, over an icon with a bottom line (A), and over an icon inside the ring (rejected: a 9px glyph in a ring looked bad). The pill background is clipped to its rounded shape and a filled rect covers `share`% of its width. The `share` rules do not change: windows use the percent, ctx runs to the vermillion threshold.

3. **Icons: Tabler-style outline paths in a 24x24 box, scaled, in ink.** Stroke 1.5 on screen (the path stroke is `1.5 / scale`), icon size 18px, centered vertically, 12px from the left edge, 7px gap to the text. Icons are `ctx` layers, `5h` clock, `7d` calendar, `model` sparkle. `kind` is set in `desktopSegments`: `5h` and `7d` by label, any other weekly label is `model`. The Tabler paths were redrawn from memory in the mockup, so confirm their shapes on screen.

   The first release (0.14.0) gave each icon its own color and looked off: four categorical hues on a bar of meters fought the attention tints. Redesign after a review with the dataviz skill: **shape carries which segment, color carries severity only.** The icon is drawn in the text color (secondary when calm, primary when it needs attention), so it follows the theme. Alternative: a color per kind. Rejected: identity is already carried by the icon and label, and the skill reserves status colors for state.

   The pill is a meter: the fill carries the severity, and the track is a lighter step of the same color.

   | State | Track | Fill | Border |
   |---|---|---|---|
   | calm | white at 0.75 (dark 0.07) | gray at 0.30 | gray at 0.30 |
   | warn | `#fab219` at 0.30 | `#fab219` at 0.80 | `#fab219` at 0.70 |
   | hot | `#d03b3b` at 0.30 | `#d03b3b` at 0.80 | `#d03b3b` at 0.70 |

   The first values (0.20 track, 0.55 and 0.50 fill, 0.45 border) read muted on the app strip and a hot context looked pink, so 0.14.3 raised them.

   The app draws its own gray strip behind the bar, so a translucent gray calm track all but vanished on it (0.14.1 screenshot). The calm track is a white chip instead (0.14.2); the dark-mode value was tuned against a guessed strip color, so check it live.

   The status hues are the dataviz reference palette's warning and critical. They are translucent, so the same values read on light and dark surfaces; ink comes from the scheme (see decision 7). Severity is never color alone: the value is in the text and the hover card names it.

4. **Hover countdown is frozen at the last redraw.** The `tip` is baked into the SVG when it is drawn, so `resets in 4h13m` can be minutes old by the time the user hovers. With no minute redraw, nothing refreshes it. Accepted for now: it still refreshes on every pace-band move, usage fetch, context change and turn. If the stale number misleads, the fallback is a reset time of day (`resets 18:40`), which never goes stale. Say so in the release note.

5. **Tick key depends on the surfaces.** `minuteKey(windows, now, countdowns)` includes the countdown text only when `countdowns` is true. The tick reads `$.session.surfaces()` and passes `includes('terminal')`. Desktop-only sessions then redraw only on a pace-band move. A session on both surfaces keeps the old minute redraw because the terminal draws the text. Alternative: always drop the countdown from the key. Rejected: the terminal countdown would freeze.

6. **Width estimate.** `text` loses the `after` term; the width is `12 + 18 + 7 + label + value + 12` using the existing per-character estimates. Checked live, as in 0.13.2.

7. **Dark mode.** The SVG carries a `prefers-color-scheme` style with ink classes for every state: `.i` (value), `.d` (label, calm icon) and `.s` (icon stroke), light `#1f1f1e` / `#6b6b6b` and dark `#f0efe9` / `#a8a79f`. Tinted pills no longer use fixed dark ink on a pale tint, which looked like a light sticker on a dark app; the translucent status color lets the app's own surface show through and the scheme ink reads on it.

## Risks / Trade-offs

- [`$.session.surfaces()` is not in the local `types/` folder] → confirm the call and its return shape against the engine types before coding; if it differs, fall back to dropping the countdown from the key only when the last draw was desktop.
- [The hand-copied icon paths may not look right] → check live; replace a path if it reads badly.
- [Without a ring, the share is a background fill, which is subtler] → fill strength 20 was picked on a mockup; adjust live if the share is hard to read.
- [Stale hover countdown] → decision 4.
- [Interactive `Svg` may still redraw on other events] → this change removes the one periodic cause; if flicker persists after release, the remaining causes are usage and context updates, which are real changes.
