# Proposal

## Why

The context bar marks the 150K warn point with `┿`, whose horizontal stroke is always heavy. Before the fill reaches it, the tick sits among the light `─` cells of the remaining part, so a short stretch of the line looks thicker than the bar around it. The tick should only add the vertical mark, not change the weight of the line it sits on.

## What Changes

- The tick glyph follows the weight of the cell it replaces:
  - `┿` (heavy horizontal) when the cell is fully used
  - `┼` (light horizontal) when the cell is in the remaining part
  - `┽` (heavy left, light right) when the cell is the half-filled `╾` cell
- Spec scenarios that show the tick in the remaining part change from `┿` to `┼`, and a scenario is added for the tick on the half cell.
- Plugin version bumps to 0.8.2.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-bar`: the Context bar requirement changes the tick glyph from a fixed `┿` to one that matches the weight of the cell it lands in.

## Impact

- `plugins/session-bar/hooks/register.tsx`: `bar()` tick substitution and its comment, plus the comment above the ctx meter.
- `plugins/session-bar/hooks/register.test.ts`: expected strings in the context bar test.
- `plugins/session-bar/.claude-plugin/plugin.json` (and the marketplace entry if it pins a version): version 0.8.2.
- Usage bars are not affected; only the ctx meter passes a tick.
