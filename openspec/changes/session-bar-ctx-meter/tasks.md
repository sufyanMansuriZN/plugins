# Tasks

## 1. The core

- [x] 1.1 Parse `tokens` and `window` into `Ctx` `{ kind: 'window' }`, add the `CTX_TICKS` table, and draw the ctx meter, the token count and its badge in `ctxSegment`, on the `DETAILS` rung, in `hooks/bar.ts`. Verify: `claude plugin test plugins/session-bar` passes the meter and tick on a 1M window (tick after cell 2) and on a 200K window (tick after cell 6), the badge at the tick and plain just below it, no tick on a window smaller than its tick, the ctx meter gone on a narrow row, and the subagent's view unchanged.

## 2. The band

- [x] 2.1 Update `hooks/register.test.tsx` for the new ctx row on the terminal and desktop surfaces: the main view on 1M and 200K windows, the badge's color at and below the tick, and the narrow-band order. Verify: `claude plugin test plugins/session-bar` and `tsc -p plugins/session-bar` pass.

## 3. Docs

- [x] 3.1 Describe the ctx meter, its tick and its badge in `plugins/session-bar/README.md`. Verify: `openspec validate session-bar-ctx-meter --strict` and `claude plugin validate plugins/session-bar` pass.

## 4. Release

- [ ] 4.1 Live check: see the ctx meter, its tick and the badge past it in a real session on a 1M model and on a 200K model, in the terminal and in the desktop app. Archive this change after `session-bar-two-zones`, once the user accepts 3.1.0.
