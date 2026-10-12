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

3. **Icons: Tabler-style outline paths in a 24x24 box, scaled.** Chosen values from the playground: stroke 1.5 (in 24-unit space scaled to 1.5px on screen, so the path stroke is `1.5 / scale`), icon size 18px, centered vertically, 12px from the left edge, 7px gap to the text. Neutral fill strength 20 (gray at 0.20 opacity over the 0.14 base); tinted fill is the tint's own accent (`#B26A00` warn, `#D55E00` hot) at 0.35 over its tint.

   | Kind | Icon | Neutral (light / dark) | On a tint |
   |---|---|---|---|
   | `ctx` | layers | coral 600 `#993C1D` / 200 `#F0997B` | coral 800 `#712B13` |
   | `5h` | clock | blue 600 `#185FA5` / 200 `#85B7EB` | blue 800 `#0C447C` |
   | `7d` | calendar | purple 600 `#534AB7` / 200 `#AFA9EC` | purple 800 `#3C3489` |
   | `model` | sparkle | teal 600 `#0F6E56` / 200 `#5DCAA5` | teal 800 `#085041` |

   `kind` is set in `desktopSegments`: `5h` and `7d` by label, any other weekly label is `model`. Icon color is fixed per kind and never encodes attention, which the tint already does. The Tabler paths were redrawn from memory in the mockup, so confirm their shapes on screen. Alternative: icon color follows attention level. Rejected: it would repeat the tint and lose the per-segment identity.

4. **Hover countdown is frozen at the last redraw.** The `tip` is baked into the SVG when it is drawn, so `resets in 4h13m` can be minutes old by the time the user hovers. With no minute redraw, nothing refreshes it. Accepted for now: it still refreshes on every pace-band move, usage fetch, context change and turn. If the stale number misleads, the fallback is a reset time of day (`resets 18:40`), which never goes stale. Say so in the release note.

5. **Tick key depends on the surfaces.** `minuteKey(windows, now, countdowns)` includes the countdown text only when `countdowns` is true. The tick reads `$.session.surfaces()` and passes `includes('terminal')`. Desktop-only sessions then redraw only on a pace-band move. A session on both surfaces keeps the old minute redraw because the terminal draws the text. Alternative: always drop the countdown from the key. Rejected: the terminal countdown would freeze.

6. **Width estimate.** `text` loses the `after` term; the width is `12 + 18 + 7 + label + value + 12` using the existing per-character estimates. Checked live, as in 0.13.2.

7. **Dark mode.** The SVG already carries a `prefers-color-scheme` style for the neutral pill. Icon colors join it as classes (`.k-ctx`, `.k-5h`, `.k-7d`, `.k-model`) with the dark stops; tinted pills set the 800 stroke inline. The gray fill uses `rgba(127,127,127,…)`, which reads on both.

## Risks / Trade-offs

- [`$.session.surfaces()` is not in the local `types/` folder] → confirm the call and its return shape against the engine types before coding; if it differs, fall back to dropping the countdown from the key only when the last draw was desktop.
- [The hand-copied icon paths may not look right] → check live; replace a path if it reads badly.
- [Without a ring, the share is a background fill, which is subtler] → fill strength 20 was picked on a mockup; adjust live if the share is hard to read.
- [Stale hover countdown] → decision 4.
- [Interactive `Svg` may still redraw on other events] → this change removes the one periodic cause; if flicker persists after release, the remaining causes are usage and context updates, which are real changes.
