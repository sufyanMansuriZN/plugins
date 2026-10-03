# Tasks

## 1. Weight-matched tick

- [x] 1.1 In `register.test.ts`, update the "context bar runs to the hot threshold" test to the new spec strings (`━━━━━─┼───`, `━━━━━────┼`, `━━╾┼─`, rest run `─┼───`), add a 160,000-token case expecting `━━━━━━┽───`, and keep the `┿` cases for reached cells; verify the updated test fails against the current code
- [x] 1.2 In `bar()` (`register.tsx`), pick the tick glyph by the cell it replaces: `┿` when the cell index is below the full-cell count, `┽` when it is the `╾` half cell, `┼` otherwise; update the comment above `bar()` and the `┿ marks warn` comment at the ctx meter; verify the full test suite passes
- [x] 1.3 Bump `plugins/session-bar/.claude-plugin/plugin.json` to 0.8.2 and verify the plugin version reads 0.8.2

## 2. Check

- [ ] 2.1 Run `openspec validate ctx-tick-weight` and verify it passes; after reinstalling and restarting, confirm in the terminal that the tick no longer looks thicker than the light part of the ctx bar
