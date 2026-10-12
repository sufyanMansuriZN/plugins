# Proposal

## Why

On Desktop the 5h pill carries a countdown (`4h13m`). The text changes every minute, so the pill redraws every minute and the whole bar flickers. 0.13.3 skips redraws when nothing moved, but the countdown moves each minute by design. The countdown should show only on hover.

The three pills also use the same ring, so `5h`, `7d` and context look alike until the text is read. A colored icon per segment lets the eye tell them apart at a glance.

## What Changes

- No pill shows a countdown. The countdown stays in the hover text.
- The minute tick no longer redraws Desktop for a countdown change. It still redraws when a pace band moves.
- The ring is replaced. Each pill is `[icon] [label] value`, and the pill background fills left to right with the share used.
- Each segment has its own colored icon: context (layers, coral), 5h (clock, blue), 7d (calendar, purple), per-model weekly (sparkle, teal).
- Terminal output is unchanged, including its countdown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the Desktop pill drops the ring and the countdown, fills as a progress bar, and carries a colored per-segment icon.

## Impact

- `plugins/session-bar/hooks/register.tsx`: `Badge` drops `after` and gains `kind`; `pill` drops the ring and the countdown width, draws the fill and the icon; `minuteKey` ignores countdown text when Desktop is the only surface.
- `plugins/session-bar/hooks/register.test.ts`: pill and tick tests change.
- `plugins/session-bar/.claude-plugin/plugin.json` bumps the version.
- Builds on the uncommitted 0.13.3 work in `session-bar-desktop-surface` (task 6.2 still open). Release and archive that change first, or release both together.
- Assumption: the hover text stays frozen at the last redraw, so its countdown can be minutes old. See design decision 4.
