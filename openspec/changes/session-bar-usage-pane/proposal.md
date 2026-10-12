# Proposal

## Why

On Desktop the session bar shows pills, but a pill is an `Svg` image: it takes no click, and its hover card is only a `<title>`. The app's own ring popover (context window, usage limits with reset times) cannot be opened from a mod. A native `Button` that opens a pane we draw would give the bar a detail view on click. Two things are unknown, so this change starts as a spike:

- Whether Desktop places a pane at all (`$.ui.open` may resolve `isPlaced: false` on an older Desktop).
- Whether a native `Button` in the `AbovePrompt` band avoids the flicker that interactive `Svg` caused (0.14.4).

## What Changes

- **Spike first:** probe `$.ui.open` on Desktop and read `isPlaced`; then add one native `Button` next to the pills and watch for flicker on send and turn complete. If either fails, stop and archive the change with the finding. Nothing else ships.
- If both pass: a `Usage` button on the Desktop bar opens a `usage` pane; pressing it again closes it.
- The pane shows, drawn by the mod with non-interactive `Svg` meters: context (tokens, window, warn and hot thresholds), 5h, 7d and each per-model weekly window, each with a pace tick, the reset countdown and the reset clock time, and an ahead-of-pace or on-pace note.
- The existing pills are unchanged and stay non-interactive.
- The button shows whenever the pills show, so the pane is reachable when all is calm.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-bar`: adds a Desktop usage pane opened by a button on the bar; the "Desktop shows only what the app hides" and "Desktop pills" requirements are unchanged.

## Impact

- `plugins/session-bar/hooks/register.tsx`: a `Button` in the desktop branch of the `AbovePrompt` hook, a `Pane` render hook, a `ui.press` handler, pane drawing helpers.
- `plugins/session-bar/hooks/register.test.ts`: tests for the pane's data (pace tick, reset clock time) and the button's presence.
- `plugin.json` version bump on release.
- Not in scope: the terminal bar, the pills' look, opening the app's own popover (no API for it), a link to `claude.ai/settings/usage`.
