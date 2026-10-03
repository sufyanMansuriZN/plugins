# Proposal

## Why

The ctx bar measures the share of the 1M window, while its color follows absolute tokens (150K warn, 250K hot), so at 187K the bar looks nearly empty inside an orange pill. The cache segment is noise: a low reading comes from events the user cannot undo by the time it shows. And when the terminal narrows, the 5h reset countdown, the one the user actually watches, is the first thing dropped.

## What Changes

- The ctx bar runs from 0 to the hot threshold (`min(250K, 0.8 × window)`), so a full bar means red, and a `┿` tick marks the warn point (150K).
- The ctx text becomes the token count alone (`187K`, not `187K/1M`).
- The model label carries the window size from the context reading (`Opus 5.5 1M`), since the model ID only sometimes names it (`[1m]`).
- **BREAKING** The cache segment is removed, along with the cache-ratio reading taken after each context change.
- The 5h reset countdown stays until the narrowest tier. The 7d and per-model weekly countdowns stay dimmed and show only at full width.
- New width order: drop the weekly countdowns → 5-cell bars → drop the bars → drop the 5h countdown.
- Pace-based coloring of usage windows is unchanged. This change adds no pace tick and no "runs out in" projection.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-bar`: the ctx bar gets its own scale and a warn tick, the ctx text drops the window size and the model label gains it, the cache hit-ratio requirement is removed, countdowns are dimmed with 5h ones prioritized, and the width adaptation order changes.

## Impact

- `plugins/session-bar/hooks/register.tsx`: bar drawing, `segments`/`layout` tiers, and removal of the cache atom, helpers and the `session.usage({ breakdown })` call.
- `plugins/session-bar/hooks/register.test.ts`: the ctx, tier and cache tests.
- `plugins/session-bar/types/index.d.ts`: the `cache` state key goes.
- `plugins/session-bar/.claude-plugin/plugin.json`: version bump to 0.8.0 (0.8.1 with the model label), and "cache" dropped from the description.
