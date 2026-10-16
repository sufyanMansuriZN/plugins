# Tasks

## 1. Subtract

- [x] 1.1 Remove `plugins/session-bar/hooks` and `plugins/session-bar/types`. Verify: `git ls-files plugins/session-bar` lists only the manifest and `tsconfig.json`.

## 2. The status line

- [x] 2.1 Write the pure core in `hooks/register.ts`: the `Limit`, `Reading`, `Git` and `Snapshot` types, `line(snapshot, now)`, `modelLabel`, `countdown`, the pace rule, `parseGit` over `git status --porcelain=v2 --branch`, and the header and endpoint parsers. Verify: unit tests of `line()` for clean and dirty git, no repo, ctx absent and marked, pace warn and hot, no reset time, a passed reset, spend_limit and the model labels.
- [x] 2.2 Wire the hooks: `session.start`, `turn.step`, `turn.complete`, `session.compact` and a 30-second `$.clock.every`. Fetch the usage endpoint once after start and at most every 5 minutes. Let the newest reading win whole. Set `$.ui.status` only on a changed text. Verify: kit tests that session.start sets the line, a turn.step with new usage changes it, the same text twice is set once, and a newer header reading beats an older endpoint reading and the other way round.
- [x] 2.3 Run `claude plugin validate plugins/session-bar`, `claude plugin test plugins/session-bar` and a type-check against the build's declarations. Verify: all pass.
- [x] 2.4 Live check in tmux with the installed copy disabled. Verify: the captured line matches `/usage` and the clock.
- [x] 2.5 Review fixes: git status with no optional locks and a 10 s timeout; header stamp from the newest `turn.step` with a response; non-blocking turn hooks through one rebuild queue; an endpoint reading only with a usable limit; a 1-minute retry after a failed fetch. Verify: the new kit tests fail on the previous code and pass now, and a `git add` loop beside an idle session never hits `index.lock`.

## 3. Docs

- [x] 3.1 Set version 1.0.0 and the new description in `plugin.json`, `README.md` and `.claude-plugin/marketplace.json`. Verify: `grep session-bar README.md .claude-plugin/marketplace.json` shows the new text.

## 4. Release

- [ ] 4.1 Archive this change and sync the delta into `openspec/specs/session-bar/spec.md` after the user accepts the rebuild.
