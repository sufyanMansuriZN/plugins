# Proposal

## Why

The terminal bar is one run of seven equal ` · `-separated sections, so where the session is and how much is spent blur together, and each gauge moves sideways whenever a value, a countdown or a pill changes width. On a light theme the faint (SGR dim) labels, separators and bar remainders fade into the background, leaving only hairlines. Previewed in Ghostty on light and dark themes (concept F), a two-zone layout with fixed slots and one mid grey fixes all three without changing what the bar says.

## What Changes

- Two zones: identity on the left (directory, branch, subagent type, model, cache state), gauges on the right (context, 5h, 7d, per-model weekly), pinned to the band's right edge. Gauges are set apart by space, not ` · `; the ` · ` stays between identity sections.
- Gauges hold their columns: a value takes a fixed 4-cell slot, a countdown a fixed 5-cell slot, and a calm gauge takes the same cells its pill would (its padding blank), so nothing shifts when a value changes length or a gauge becomes a pill.
- Dimmed text (labels, branch, model, separators, countdowns, the bar's remaining part, the calm cache section) is drawn in one fixed mid grey that reads on light and dark themes, instead of the terminal's faint attribute.
- Values are bold, so they stand out from their label and countdown.
- Inside a pill, the bar's remaining part is a darker shade of the pill's fill instead of the dark text color, so the used part reads against it.
- Bars are 5 cells at every width (they were 10, and 5 only on narrower terminals), so the width tiers lose their short-bars step.
- Unchanged: what each section says and when, the bar glyphs and the context tick, the orange and vermillion square pills, the cache order and alarm from `session-bar-cache-cold-alarm`, the rest of the width tiers' shedding order, and everything on Desktop.

Builds on `session-bar-cache-cold-alarm` (in the main checkout, not on this branch), which archives first; this change's Width adaptation and Cache state in the terminal bar blocks start from that change's text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: Calm segments are plain text, attention becomes a pill (grey instead of faint, bold values, pill bar shade), Cache state in the terminal bar (separators per zone), Width adaptation (zones close up before any part is shed); new requirements for the two zones, fixed gauge positions, and the secondary grey.

## Impact

- `plugins/session-bar/hooks/register.tsx`: `segments`, `segment`, `cacheRun`, `layout`, `bar` (pill shade), and the terminal render, which lays out two zones across `bodyColumns`.
- `plugins/session-bar/hooks/register.test.ts`: runs for the two zones, slot widths, grey runs and bold values; width-tier checks against the new widths.
- `plugins/session-bar/.claude-plugin/plugin.json`: version bump on release.
