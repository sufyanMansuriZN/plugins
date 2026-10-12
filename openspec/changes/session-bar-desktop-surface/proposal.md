# Proposal

## Why

The session bar is drawn for a terminal. Claude Desktop also raises `AbovePrompt`, and there the bar repeats what the app already shows: the directory (header chip), the model (composer footer), and context and usage (context ring tooltip, usage popover, `/usage`). It also loses its bars, because Desktop's `bodyColumns` pushes the layout into the thinnest tier. The branch shows in Desktop's changes band once a file is edited, so it is a duplicate too.

## What Changes

- The `ui.render` hook reads `e.surface`. The terminal path is unchanged.
- On the desktop surface the directory, branch and model segments are left out.
- On the desktop surface the context and usage segments show only while one of them needs attention, and then all of them show, as rounded pills with a ring. A calm session draws nothing.
- Each desktop pill is one SVG: a ring filled to the share used, then the text. The context pill drops its `ctx` label, usage pills show a dim label and a bold value, and only 5h shows its countdown. Hovering a pill shows the full name, reset time and pace.
- With nothing needing attention, the desktop hook draws no band of its own.
- The `session-bar` spec gains the branch segment, which 0.10.0 shipped without a requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: adds a git branch segment, and a Desktop presentation (pills with a ring, shown once something needs attention).

## Impact

- `plugins/session-bar/hooks/register.tsx`: `segments` and `layout` take the surface; the `ui.render` hook passes `e.surface` and may return `next(e)` alone.
- `plugins/session-bar/hooks/register.test.ts`: new desktop tests; the existing "row is always visible" test asserts `skills` and `Opus 5.5` on desktop and must change.
- `plugins/session-bar/.claude-plugin/plugin.json` version bump and the marketplace entry.
- No new dependencies. Terminal output is unchanged.
