# Tasks

## 1. The core

- [x] 1.1 Add `where` to `BarInput`, return `{ left, right }` from `segments`, and fit both zones with one `GAP`, the `DETAILS` ladder and the `KEEPS` and `SHEDS` tables in `hooks/bar.ts`. Verify: `claude plugin test plugins/session-bar` passes each zone's text, each part left out without a value, the right zone's ladder with a whole left zone, the branch cut to 12 before a meter goes, then the branch cut, the branch left out and the name cut, and no gap with no gauges.

## 2. The band

- [x] 2.1 Read the repo name into a `where` state with `$.session.repo()` and `$.session.cwd()` in `refreshRepo`, add it to `PluginState`, and draw the left zone in a `Box` with `flexGrow={1}` and the right zone in a `Box` with `marginLeft={GAP}` in `hooks/register.tsx`. Verify: `claude plugin test plugins/session-bar` passes the repo root's name in a worktree, the directory's name outside a repo, no name when the repo read fails, both zones in the main and subagent views, the narrow-band order and a row at exactly its width, on terminal and desktop, and `tsc -p plugins/session-bar` passes.

## 3. Docs

- [x] 3.1 Describe the two zones, the repo name and the new narrow-band order in `plugins/session-bar/README.md`. Verify: `openspec validate session-bar-two-zones --strict` and `claude plugin validate plugins/session-bar` pass.

## 4. Release

- [ ] 4.1 Live check: see the two zones in the band of a real session in a repo, in a worktree and outside a repo, in the terminal and in the desktop app, and see the parts go in order on a narrow terminal. Archive this change after `session-bar-pace-meter`, once the user accepts 3.1.0.
