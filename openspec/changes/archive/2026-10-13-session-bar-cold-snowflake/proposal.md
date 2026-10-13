# Proposal

## Why

The cold-cache glyph on the Desktop context pill does not match the mockup the user approved. The mockup used Tabler's `snowflake` icon. The code draws a hand-made path: a six-armed asterisk with a chevron on the top and bottom arms only. At pill size it reads as an asterisk, not a snowflake.

The usage block also has nothing that links a row to its pill. The rows use the app's long names (`Session limit`, `Weekly · all models`), and the pills use short ones (`5h`, `7d`). The pill's cache glyph also has no words, and the usage block is the one place that could explain it.

A live check against the approved mockup then showed the pills, meters and block drawn differently from it, in ways the plugin can change.

## What Changes

- Replace the `cold` path in `CACHE_GLYPH` with the Tabler outline `snowflake` paths.
- Usage block: put the pill's icon before each row name (stack, clock, calendar, sparkles), at all widths, and the pill's cache glyph before the cache line. The icons are the mockup's accent blue (#173c95, #85b7eb on dark).
- Pills, as the mockup: 24px high, 10px sides, a 15px icon with a 1.5px stroke in the primary ink, 5px between icon, label and value, all 12px text, and a neutral hairline border in place of the hue-tinted one.
- Meters, as the mockup: 6px high, a plain gray track with no outline, the fill solid in its color; the time-gone shadow stays, a darker gray.
- The open block draws as a card (inverse ground, round border, 2 cells of padding, 1 at one row a line), with 1 cell above the pills in place of 3.
- No icons on the pace lines or the context range line.
- Release as session-bar 0.18.0.
- Out of scope, as Desktop sets them: the band's gray strip, text sizes and the dim text color, and spacing finer than one 8px cell. Also out of scope: the pill layout (labeled pills left, context right) and the context pill's status colors, which the spec sets.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-bar`: adds "Usage block row icons" and "Usage block card and meters"; modifies "Cache state on the Desktop context pill" (the snowflake), "Cache line in the usage block" (its glyph) and "Usage block window rows" (a darker shadow).

## Impact

- Code: `plugins/session-bar/hooks/register.tsx`, `plugins/session-bar/hooks/register.test.ts`.
- Version: `plugins/session-bar/.claude-plugin/plugin.json` 0.17.0 → 0.18.0.
- Pill widths shrink (smaller icon, padding and text), so `desktopTier` keeps more parts at a given width.
- Desktop render: 4 to 5 more non-interactive `Svg` elements while the usage block is open. None while it is collapsed.
