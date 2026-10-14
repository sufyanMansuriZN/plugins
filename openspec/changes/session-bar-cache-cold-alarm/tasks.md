# Tasks

All paths under `plugins/session-bar/`. Verify each group with `claude plugin test` for session-bar and a clean `tsc`.

## 1. Transcript per session

- [x] 1.1 In `hooks/register.tsx`, key `findTranscript`'s cached path by `$.session.id()` and search again when the id differs; add a test where `session.id` answers `sess-1` then `sess-2` and the TTL grep runs against `sess-2.jsonl`; verify the test passes

## 2. Cache state without a context reading

- [x] 2.1 Drop the `tokens === undefined` return in `cacheState`; make `cacheText` leave out `re-reads …` when tokens are unknown (`Cache cold`); update the `cacheState(sent(22 * MIN), undefined, NOW)` expectation to warm 38m and add a cold-without-tokens case; verify tests pass

## 3. Seed from the transcript in a new process

- [x] 3.1 Add a pure `seedCache(grepOutput)` returning a `Cache` or undefined: newest main-loop line (skip `isSidechain: true`) gives `sentAt` from `timestamp`, `model`, `read`, `input`; TTL from the newest main-loop line that wrote cache tokens. Unit-test the spec's scenarios: resumed overnight (cold), within TTL (warm 40m), newest wrote nothing (warm 50m), subagent line newest (cold), no lines (undefined); verify they pass
- [x] 3.2 At `session.start`, when the `cache` atom is null, run `grep -F '"cache_creation"' <transcript> | tail -n 20` via `$.process.run` (through `sh -c`), seed the atom only if still null, swallow failures; add a kit test with a faked transcript grep showing `cache cold` in the terminal bar before any `turn.step`; verify it passes
- [x] 3.3 Live: resume an old session with `claude --resume` and check the bar shows cold before sending; then `/clear` and `/resume` in one process and check whether `session.start` fires (debug log). If it does not, also seed when `findTranscript` sees a new session id, and add a test for it. Found: `session.start` fires once per process; `/clear` and `/resume` fire only `classic.SessionStart`, so the seed also runs there, from its `transcript_path` (kit test added); both checked live

## 4. Terminal pills

- [x] 4.1 Make `cacheRun` return `Run[]`: soon via `segment('warn', …)` reading `cache 4m`, cold via `segment('hot', …)` reading `cache cold · re-reads 412K` (just `cache cold` without tokens or at tier 4), active and warm unchanged; update the `run(...)` expectations at ~796 and the kit test at ~958; verify the cold run carries the vermillion background and tests pass
- [x] 4.2 Add a `layout` test at a narrow width with a cold cache: the tier-4 bar keeps the `cache cold` pill after the model; verify it passes

## 5. Desktop cache pill

- [x] 5.1 Add `Kind` `'cache'`; `desktopSegments` pushes a cache badge right after ctx only for soon (`warn`, `4m`) and cold (`hot`, `cold`), tip from `cacheText`; ctx badge's `cache` only for active and warm; extend `GLYPH`/`HUE` for the new kind. Tests: cold badge tip `Cache cold, the next message re-reads 412K`, warm has no cache badge, cold without ctx gives a cache badge alone; verify they pass
- [x] 5.2 Make `pill()` keep the icon for the cache kind at every tier (and `desktopTier`'s sums use it); test at 33 cells that the cache pill's source holds the snowflake path and the others have no icon; verify it passes
- [x] 5.3 Make `minuteKey` count the cache countdown when the state is soon on a Desktop-only session; test 4m→3m redraws and 38m→37m does not; verify they pass
- [x] 5.4 Live on Desktop via dev-mods hot reload: reopen a session idle past its TTL and check a red snowflake `cold` pill sits right of the ctx pill, ctx shows no glyph, and the hover card reads the cache line. Found on the way: a dev-mods copy renamed `session-bar-dev` needs its state keys renamed too, or its writes are refused and it draws nothing; and a resume writes a `<synthetic>` line, now skipped by the seed

## 6. Release

- [ ] 6.1 After `session-bar-cache-after-model` is archived, bump `.claude-plugin/plugin.json` to 0.22.0, commit, push, `claude plugin update session-bar`; verify a new process on an hour-old session shows the cold pill

## Workflow follow-up

- Archive the change after 3.3, 5.4 and 6.1 pass.
