# Tasks

## 1. The core

- [x] 1.1 Add `pace`, the `PACE` table, the 8-cell meter and the `DETAILS` ladder to `hooks/bar.ts`, and drop the old pace colors. Verify: `claude plugin test plugins/session-bar` passes the full row, each pace's word and color, the 5-point and 20-point edges, the meter cells for ahead, on and behind, the spend limit meter with no word, the ladder and the countdowns.

## 2. The band

- [x] 2.1 Map the `green` and `blue` tones to `success` and `suggestion` in `hooks/register.tsx`. Verify: `claude plugin test plugins/session-bar` passes the band's pace colors and narrow-band cases on terminal and desktop, and `tsc -p plugins/session-bar` passes.

## 3. Docs

- [x] 3.1 Describe the meter and pace words in `plugins/session-bar/README.md` and set 3.1.0 in `plugin.json` and the root `README.md`. Verify: `grep -rn "3.1.0" README.md plugins/session-bar` shows each and `claude plugin validate plugins/session-bar` passes.

## 4. Release

- [ ] 4.1 Live check: see the meters and pace words in the band of a real session, and the row drop them on a narrow terminal. Archive this change after the user accepts 3.1.0.
