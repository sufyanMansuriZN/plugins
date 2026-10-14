# Proposal

## Why

The cache state is keyed by model, so it reads best next to the model it belongs to. In the terminal bar it now sits after the context segment, between the context and the usage windows, away from the model.

## What Changes

- The terminal bar draws the cache section right after the model: `plugins (main) · Opus 5.5 · cache 38m · ctx ▰▰▱ 412K · 5h …`.
- The cache section keeps its words, colors and narrow-tier rule (only `cache cold` at the narrowest tier). Only its place changes.
- The Desktop pill and the usage block are unchanged: Desktop shows the cache as a glyph on the context pill, not as a section.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the terminal cache section moves from after the context segment to right after the model (Cache state in the terminal bar, and the cold-cache scenario of Width adaptation).

## Impact

- `plugins/session-bar/hooks/register.tsx`: `segments()` pushes the cache group before the context group.
- `plugins/session-bar/hooks/register.test.ts`: the order assertion in the terminal cache test.
- `plugins/session-bar/.claude-plugin/plugin.json`: version bump to 0.21.0 on release.
