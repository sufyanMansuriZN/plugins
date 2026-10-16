# Proposal

## Why

The session bar grew into a 907-line band above the prompt. It had Desktop pills, a usage block, a cache timer read from the transcript, width tiers and a types contract. The user wants a status line with live, accurate data and nothing else. A friend installs it from the marketplace, so the plugin keeps the name `session-bar`.

## What Changes

- **BREAKING** The band above the prompt goes. No `ui.render` hooks, no Desktop drawing, no usage block, no cache state, no `$.state` atoms, no types contract.
- The plugin sets one plain-text line through `$.ui.status`, under the prompt: git branch and file counts, model label with its window size, context percent, and the 5h, 7d and spend-limit windows with a reset countdown.
- `!` and `!!` mark a context or usage figure that needs attention. Usage windows are marked by pace against the share of the window gone.
- Usage figures come from the newer of two readings: the response headers (`$.session.usage().rateLimits`) or the OAuth usage endpoint, fetched at launch, then every 5 minutes, or 1 minute after a failed fetch.
- The line updates on each API response, turn end, compaction and a 30-second tick. It is set only when its text changes.
- Version 1.0.0. The description becomes "Live status line: git, model, context and usage windows".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: every requirement is removed and replaced by the status line requirements.

## Impact

- `plugins/session-bar/hooks/register.ts` (new, replaces `register.tsx`), `register.test.ts`, `hooks.json`, `.claude-plugin/plugin.json`.
- `plugins/session-bar/types/` is removed.
- `README.md` and `.claude-plugin/marketplace.json` carry the new description.
