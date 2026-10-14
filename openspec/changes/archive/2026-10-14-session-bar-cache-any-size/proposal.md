# Proposal

## Why

The cache state (`❄ 23m` in the terminal, the flame/hourglass/snowflake glyph on Desktop) only shows once the context holds 100K tokens. Most sessions sit below that, so the state is missing exactly where it is checked most, and a 66K miss still re-sends the whole context at full price and adds latency.

## What Changes

- Show the cache state at any context size, on both surfaces, as soon as the TTL is known.
- Remove the 100K gate (`CACHE_MIN`); the state stays hidden before the first main request, in a subagent's view, while the TTL is unknown, and without a context reading.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-bar`: the Cache state requirement drops its 100K-token threshold.

## Impact

- `plugins/session-bar/hooks/register.tsx`: `CACHE_MIN` and its check in `cacheState()`.
- `plugins/session-bar/hooks/register.test.ts`: the cache state test's below-100K cases.
- `readTtl` greps the whole transcript and, while the TTL is unknown, reads again 1 s and 5 s after the turn's end and on the minute tick: the live check found the first turn's TTL never read, as a 126 KB `prompt_snapshot` line pushed its usage line out of the 64 KB tail, and the line can land after the turn ends. The 100K gate hid this.
- `cache in use` shows while a request streams even before any TTL is read, so a session's first request shows it.
- The terminal cache state becomes a section of its own in words (`cache 56m`), as the `❄` glyph drew emoji-styled and two cells wide; every section is separated by a dim ` · `.
- The terminal bar is about 12 characters wider from the first request on, so narrow terminals reach the shorter tiers sooner.
- `plugin.json` version bump for release.
