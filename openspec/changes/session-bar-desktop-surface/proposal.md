# Proposal

## Why

The session bar is drawn for a terminal. Claude Desktop also raises `AbovePrompt`, and there the bar repeats what the app already shows: the directory (header chip), the model (composer footer), and context and usage (context ring tooltip, usage popover, `/usage`). It also loses its bars, because Desktop's `bodyColumns` pushes the layout into the thinnest tier. The branch shows in Desktop's changes band once a file is edited, so it is a duplicate too.

## What Changes

- The `ui.render` hook reads `e.surface`. The terminal path is unchanged.
- On the desktop surface the directory, branch and model segments are left out.
- On the desktop surface the context and usage segments show only when they need attention, as a ring badge. A calm session draws nothing.
- The desktop attention segment is a ring badge (a small SVG ring filled to the share used, then the text), with no filled background, no Powerline caps and no cell-grid bar, so it needs no Nerd Font and fits the app's look.
- With nothing needing attention, the desktop hook draws no band of its own.
- The `session-bar` spec gains the branch segment, which 0.10.0 shipped without a requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: adds a git branch segment, and a Desktop presentation (attention-only segments).

## Impact

- `plugins/session-bar/hooks/register.tsx`: `segments` and `layout` take the surface; the `ui.render` hook passes `e.surface` and may return `next(e)` alone.
- `plugins/session-bar/hooks/register.test.ts`: new desktop tests; the existing "row is always visible" test asserts `skills` and `Opus 5.5` on desktop and must change.
- `plugins/session-bar/.claude-plugin/plugin.json` version bump and the marketplace entry.
- No new dependencies. Terminal output is unchanged.
