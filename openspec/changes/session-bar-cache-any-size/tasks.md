# Tasks

## 1. Drop the 100K gate

- [x] 1.1 In `plugins/session-bar/hooks/register.tsx`, delete `CACHE_MIN` and its "below 100K a miss costs little" comment, and drop `tokens < CACHE_MIN` from `cacheState()`, keeping the `tokens === undefined` check; verify `tsc` is clean
- [x] 1.2 In `plugins/session-bar/hooks/register.test.ts`, remove the `CACHE_MIN` import, retitle the cache state test without "none below 100K", turn the 45K case into `{ state: 'warm', left: 38 * MIN }` and drop the `CACHE_MIN` case, keeping the no-reading (`undefined` tokens) case; verify `claude plugin test` passes for session-bar

## 1b. Fixes from the first live check

- [x] 1.3 In `readTtl`, find the request's line with `grep -F '"cache_read_input_tokens":<read>'` over the whole transcript instead of a 64 KB tail (a 126 KB `prompt_snapshot` line lands after the first request's usage line); add a test with a large line after the usage line; verify tests pass
- [x] 1.4 Retry `readTtl` on the minute tick while the last main request's counts are known and its TTL is not (its line can land after the turn ends); add a test; verify tests pass
- [x] 1.5 Draw the terminal cache state as a section of its own after ctx, in words (`cache 56m`, `cache in use`, `cache cold`; only `cache cold` at the narrowest tier), and add the Width adaptation, Cache TTL and terminal cache requirements to the spec delta: the `❄` glyph, text presentation selector included, rendered emoji-styled and two cells wide in the live check; update the tests
- [x] 1.6 Separate the terminal bar's groups (dir and model, ctx, each usage window) with a dim ` · ` in place of the three-space gap, the same width; update the tests
- [x] 1.7 Show `cache in use` while a request streams even before any TTL is read (a session's first request showed nothing); at a turn's end with the TTL still unknown, read it again after 1 s and 5 s; update the tests and the spec delta

## 2. Live check and release

- [x] 2.1 In a terminal session under 100K tokens, send a prompt; verify the bar shows `cache in use` while it streams and `cache <minutes>` within seconds after, from the first reply on, with a dim ` · ` between sections
- [ ] 2.2 Sync the spec delta into `openspec/specs/session-bar`, bump `plugin.json` to 0.20.0, release (commit, push, `claude plugin update session-bar`); verify a new session shows the cache state under 100K tokens

## Workflow follow-up

- Archive the change after the live check passes.
