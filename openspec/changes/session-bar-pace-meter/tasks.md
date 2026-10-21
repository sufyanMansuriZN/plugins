# Tasks

## 1. The core

- [x] 1.1 Add `pace`, the `PACE` table, the 8-cell meter with half cells and its joined pace tick, the pace badge run and the three-width ladder to `hooks/bar.ts`, and drop the old pace colors and the `green` tone. Verify: `claude plugin test plugins/session-bar` passes the full row, half cells, the tick arms beside a half cell, each badge and its tone, no badge on pace, the 5-point and 20-point edges, the cells for ahead, on, behind and used up, the tick at boundaries 0 and 8, the 7d pace, the spend limit, the ladder and the countdowns.

## 2. The band

- [x] 2.1 Map the tones to the Okabe-Ito hexes in `hooks/register.tsx` and draw a badge as black bold text on its tone's color. Verify: `claude plugin test plugins/session-bar` passes the badge and text colors, the plain percent and tick, and the narrow-band cases on terminal and desktop, and `tsc -p plugins/session-bar` passes.

## 3. Docs

- [x] 3.1 Describe the meter, the tick, half cells, the badges and their colors in `plugins/session-bar/README.md` and set 3.1.0 in `plugin.json` and the root `README.md`. Verify: `grep -rn "3.1.0" README.md plugins/session-bar` shows each and `claude plugin validate plugins/session-bar` passes.

## 4. Release

- [ ] 4.1 Live check: see the meters, ticks and badges in the band of a real session in a light and a dark theme, and the row drop the meters, then the badges, on a narrow terminal. Archive this change after the user accepts 3.1.0.
