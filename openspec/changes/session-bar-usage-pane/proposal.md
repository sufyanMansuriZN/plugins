# Proposal

## Why

On Desktop the session bar shows pills, but a pill is an `Svg` image: it takes no click, and its hover card is only a `<title>`. The app's own ring popover (context window, usage limits with reset times) cannot be opened from a mod. A native `Button` that expands a detail block we draw gives the bar a detail view on click. Two things were unknown, so the change began as a spike: whether a pane is placed on Desktop (it was: `isPlaced: true`), and whether a native `Button` in the `AbovePrompt` band avoids the flicker that interactive `Svg` caused in 0.14.4 (it did).

The first build opened the detail in a side pane (0.15.0). The pane is tall, mostly empty, and far from the pills, so it is replaced by an inline expand above the prompt, chosen from mockups of both. Its first rows also used a tick for the elapsed share of a window, which reads as a limit to stay under; for a quota the aim is to use it fully at a safe pace, so rows say where the person stands against pace instead.

## What Changes

- A `Usage details` button on the Desktop bar (`⤢` when the bar is too narrow for the name) expands a detail block above the pills; pressing it again, or sending a prompt, collapses the block. The open state is kept per session.
- The block is a grid of rows, two per line: context, Session limit, Weekly · all models, and each Weekly · model. Where two do not fit, it shows one compact row per line (name, meter and value on one line) so it never scrolls the pills away. Rows carry the app's own names, in the block only; the pills keep `5h`, `7d` and the model name.
- The pills and the button always fit one row: on a narrow bar the pills drop their labels, then the button its name, then the pills their icons, as the terminal bar sheds parts by tier.
- A calm quota has a hue of its own in its pill and meter (5h blue, 7d green, a model purple); amber and red still replace it when it needs attention. Pill values use regular weight, as a heavier one drew wider once the block opened.
- Each window row has its name, its percent, one meter with a pale shadow for the share of the window already gone, and one dim line: `Room to use more`, `On pace` or `Ahead of pace`, then when it resets. Only when ahead of pace (and past the first tenth of the window) the line adds when the cap would be hit.
- The context row has the tokens and a meter that runs to the ideal ceiling (250K, or 80% of a smaller window), not to the 1M window; its line says where the ideal range ends and keeps the window size as a fact.
- No tick, no legend. Meters are non-interactive `Svg`, as the pills are.
- The pills stay non-interactive.
- The button shows whenever the pills show, so the detail is reachable when all is calm.
- **BREAKING (vs 0.15.0 only):** the `usage` pane, its `Pane` render hook, the pane toggle and the `noPanes` flag are removed. Nothing outside this plugin used them.

## Capabilities

### New Capabilities

### Modified Capabilities
- `session-bar`: adds a Desktop usage detail block expanded by a button on the bar; "Desktop pills" changes its color rule (a hue per quota), the value weight, and gains one-row tiers.

## Impact

- `plugins/session-bar/hooks/register.tsx`: a `Button` and the detail block in the desktop branch of the `AbovePrompt` hook, a `usageOpen` atom, row data and meter drawing (shadow, verdict, cap time); the pane code from 0.15.0 is removed.
- `plugins/session-bar/hooks/register.test.ts`: tests for the block's presence and toggle, and for the row data (verdict, cap time, reset line, context line).
- `plugins/session-bar/types/index.d.ts`: `noPanes` replaced by `usageOpen`.
- `plugin.json` version bump on release.
- Not in scope: the terminal bar, a context breakdown by category (possible later through `$.session.usage({ breakdown })`), opening the app's own popover (no API for it), a side pane, a link to `claude.ai/settings/usage`.
