# Proposal

## Why

The cache state exists to warn before a message re-reads the whole context at full price, yet it is hidden in the case that needs it most (a session opened again after a long break) and, when it does show cold, it is the quietest text on the bar. A cold cache must be impossible to miss on both surfaces.

## What Changes

- Terminal: a cold cache becomes a vermillion attention pill, `cache cold · re-reads 412K` (just `cache cold` without a context reading, and at the narrowest width). Under 5 minutes left becomes an orange pill, `cache 4m`. Warm and in use stay dimmed text.
- Desktop: the cache gets a pill of its own beside the context pill, shown only with under 5 minutes left (amber, hourglass) or cold (red, snowflake). It keeps its icon at every width. While in flight or warm the context pill keeps its flame glyph as now; with its own pill showing, the context pill carries no cache glyph.
- A session opened in a new process (resume, restart, Desktop reopening a session) takes its cache state from the transcript's last main-loop response, its time and its TTL, so one left overnight shows cold before the first message.
- A cache state no longer needs a context reading to show; only the `re-reads` token count does.
- Fix: the transcript is found per session id. It was found once per module load, so after `/clear` or `/resume` in the same process the TTL was searched for in the old session's file, never found, and the cache state stayed hidden.
- No gate on sending: a cold send goes through as before.
- Unchanged: hidden before any main request, in a subagent's view, and after a compaction (the context is small then).

Builds on `session-bar-cache-after-model` (cache section right after the model), which archives first.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: Cache state (shown without a context reading, seeded from the transcript in a new process), Cache TTL from the transcript (per-session transcript), Cache state in the terminal bar (soon and cold become pills), Width adaptation (narrowest tier keeps the cold pill), Cache state on the Desktop context pill (glyph only while in flight or warm), Desktop redraws only on a visible change (cold scenario), and a new Desktop cache pill requirement.

## Impact

- `plugins/session-bar/hooks/register.tsx`: `cacheRun`, `segments`, `desktopSegments`, `pill`, `findTranscript`, a transcript seed at `session.start`, the Desktop render's right-hand group.
- `plugins/session-bar/hooks/register.test.ts`: terminal pill runs, Desktop cache pill, seed from a transcript fixture, per-session transcript lookup.
- `plugins/session-bar/.claude-plugin/plugin.json`: version bump on release.
