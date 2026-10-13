# Proposal

## Why

The prompt cache keeps a session's context cheap to send again, but only for its TTL (5 minutes or 1 hour) after the last request. A person who leaves a large session idle past that time pays for the whole context again on the next message, and nothing on screen says when that happens. The session's transcript records the TTL of every cache write, so the bar can show it.

## What Changes

- The context segment gets a cache state while the session is idle after a turn, only when the context holds 100K tokens or more: warm with the time left, warm with under 5 minutes left, or cold.
- The terminal bar adds `❄ 38m` (warm), an orange `❄ 4m` (under 5 minutes) or a dim `❄ cold` after the context tokens.
- The Desktop context pill adds one glyph for the state: a flame (warm), an hourglass (under 5 minutes), a snowflake (cold). No countdown on the pill, as today.
- The Desktop usage block's context line adds the time left (`cache cold in 38m`), or `cache cold, next message re-reads 412K` once cold.
- The TTL comes from the last main-loop request in the transcript: 1 hour when it wrote only 1-hour cache, else 5 minutes.
- The state is hidden while a turn runs, before the first turn, in a subagent's view, and when the TTL cannot be read.
- The minute tick redraws when the cache state changes, and for its countdown where one is drawn.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: adds the cache state to the context segment on both surfaces and to the usage block's context row; the terminal width tiers drop the cache countdown with the 5h one; the Desktop minute tick also redraws on a cache state change.

## Impact

- `plugins/session-bar/hooks/register.tsx`: a session atom for the cache state, set on `turn.complete` and cleared on `prompt.submit`; transcript read; terminal segment, pill and usage row text; `minuteKey`.
- `plugins/session-bar/types/index.d.ts`: the atom's type in the plugin state contract.
- `plugins/session-bar/hooks/register.test.ts`: tests for TTL parsing, states, tiers and redraw.
- `plugins/session-bar/.claude-plugin/plugin.json`: version 0.17.0.
- Reads the session transcript file, an internal format of Claude Code that may change.
