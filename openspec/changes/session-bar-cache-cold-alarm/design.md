# Design

## Context

See proposal.md for why. Current shape in `plugins/session-bar/hooks/register.tsx`:

- `cacheState(c, tokens, now)` returns nothing when the `cache` atom is null, when `tokens` is undefined, or when the TTL is unknown and nothing streams.
- The `cache` atom is filled only by this process's own `turn.step`; `$.state` is per session and starts null in every new process.
- `findTranscript` keeps the first path it finds in a module variable, whatever session asks later.
- Terminal: `cacheRun` returns one plain `Run` (dim, or orange text for soon). Attention pills already exist as `segment(level, runs)`.
- Desktop: the cache is a glyph on the ctx `Badge` (`cache` field, drawn by `pill()`); `desktopTier` drops every icon at the narrowest tier.
- The test kit already fakes `session.id`, `fs.list`, `fs.exists` and `process.run` for transcript reads (`register.test.ts` ~864, ~991).

## Goals / Non-Goals

**Goals:**
- A known cold or soon cache is drawn with the attention colors on both surfaces, at every width.
- A process opened on an existing session knows its cache state before the first send.

**Non-Goals:**
- Blocking or confirming a send.
- Toasts or sounds.
- A cache state after compaction, before any main request, or for a subagent's own loop.

## Decisions

**1. Terminal soon and cold reuse `segment()`.** `cacheRun` returns `Run[]` through `segment('warn' | 'hot', ...)` instead of one dim run, so the pill matches every other attention pill. Cold reads `cache cold · re-reads 412K` (the inner ` · ` on the pill's fill); without tokens, or at tier 4, just `cache cold`. Alternative: a bold red text run, rejected: the bar's rule is that attention is a pill.

**2. Desktop cache pill is a new `Badge` kind `'cache'`.** `desktopSegments` pushes it right after the ctx badge only for `soon` (level `warn`, value `4m`) or `cold` (level `hot`, value `cold`), and the ctx badge carries `cache` only while `active` or `warm`. `GLYPH` gains `cache` entries taken from `CACHE_GLYPH`; `HUE.cache` is never used as the pill is always in attention, but the `Record<Kind, …>` needs it, so use GRAY. It has no label, so it falls into the right-hand group beside ctx with no layout change. `pill()` draws the cache kind with `icon: true` whatever the tier, and `desktopTier`'s width sum uses the same widths, so the narrowest tier still fits. Alternative: turn the ctx pill red, rejected by the user: red ctx already means "too big".

**3. Cache state no longer needs tokens.** `cacheState` drops the `tokens === undefined` return; `cacheText` and the terminal run leave the `re-reads` part out when tokens are unknown. The usage block row is still keyed on `b.ctx`, so its cache line is unchanged.

**4. Seed from the transcript at `session.start`.** If the `cache` atom is null, run `grep -F '"cache_creation"' <transcript> | tail -n 20` through `$.process.run` (portable to macOS, where `tac` is missing; output stays small however large the file is, and `$.fs.read`'s 4 MiB cap is avoided). Parse the lines newest first and skip `isSidechain: true`. `sentAt` comes from the newest main-loop response's `timestamp` (a cache read refreshes the TTL as a write does), along with its `model`, `read` and `input`, so later `readTtl` calls stay consistent. The TTL comes from the newest main-loop response that wrote cache tokens, using `cacheTtl`'s rule. Write the atom only if it is still null (a request may have started meanwhile). A new pure helper `seedCache(text): Cache | undefined` takes the grep output, so it is unit-tested without the engine.
Alternative: seed lazily on first render, rejected: render must stay pure.

**5. Transcript path keyed by session id.** `findTranscript` keeps `{ id, path }` and searches again when `$.session.id()` differs. That is one extra `session.id()` per call, already awaited there.

**6. Desktop tick counts the cache pill's minutes.** `minuteKey`'s `cacheCountdown` is also true when the state is `soon`, so a Desktop-only session redraws `4m` → `3m`; warm minutes still do not redraw.

## Risks / Trade-offs

- [The response line's `timestamp` is when it was written, after the send, so a seeded state errs warm by the response's own length] → only matters within seconds of a 5-minute TTL edge; accepted.
- [`session.start` does not fire for `/clear` or `/resume` inside one process (confirmed live, task 3.3)] → the seed also runs on `classic.SessionStart`, which does fire there and names the new `transcript_path`.
- [The pill's `cache` glyph moving off the ctx pill changes its width between warm and soon] → a change of state, not a send; the spec's "a request SHALL NOT change the pill's width" still holds, as active and warm both draw the flame.
- [Terminal width: the cold pill is about 14 cells wider than `cache cold`] → it still sheds at the existing tiers; at tier 4 it drops to `cache cold`.

## Migration Plan

Release as a minor version after `session-bar-cache-after-model` (0.21.0) is archived: commit, push, `claude plugin update session-bar`. Rollback: `claude plugin update` to the earlier version.
