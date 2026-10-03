# Proposal

## Why

The session bar is one line of dim text. Its colors fire on raw usage (7d turns orange at 50% even on day 6), so the warnings are often false alarms and get ignored. Mods can now draw much richer bands (a desktop mod shows pills, mini bars, a pace marker and reset countdowns), and the terminal surface supports the same ideas.

## What Changes

- Keep calm segments as plain text; turn a segment into an orange or vermillion rounded pill only when it needs attention.
- Add 10-cell line bars (`━` used, `─` left) to the 5h, 7d, per-model weekly and ctx segments; show ctx as a share of the model's window.
- Add a reset countdown inside the 5h and 7d pills (`2h40m`, `1d7h`).
- **BREAKING (visual)**: color 5h/7d by pace (usage ahead of elapsed time), not by raw percentage. Color stays reserved for "look here".
- Add a cache hit-ratio pill (`cache 98%`), colored when the cache misses.
- Adapt to the band's width by measuring: drop countdowns, then shorten bars, then drop bars.
- Redraw once a minute so countdowns and pace stay current between turns.

Out of scope: input/output token pills, cost pill, hover/click actions, a plain-glyph fallback for machines without Nerd Font glyphs.

## Capabilities

### New Capabilities
- `session-bar`: what the band above the prompt shows (directory, model, context, usage windows, cache ratio), how it signals attention, and how it adapts to width.

### Modified Capabilities

## Impact

- `plugins/session-bar/hooks/register.tsx`: rendering, pace/countdown helpers, cache-ratio reading, minute timer.
- `plugins/session-bar/types/index.d.ts`: new state for the cache reading and a tick; `Weekly` gains `resetsAt`.
- `plugins/session-bar/hooks/register.test.ts`: tests for the new helpers and rendering.
- `plugins/session-bar/.claude-plugin/plugin.json`: version bump.
- Depends on Nerd Font glyphs in the terminal (Ghostty ships them built in).
