# Proposal

## Why

Four of the bar's values can be wrong without looking wrong. The cache timer starts at the turn's end, so a wait inside a turn (a foreground subagent, a long command, a permission dialog left open) shows `in use` while the cache goes cold. The context's red line is set from the model window, so a smaller auto-compact window compacts before the pill turns red. The usage windows never refresh while idle, so other sessions' spend and a reset go unseen until the next turn. A fallback model is shown as the configured one. A value that is not accurate is worth nothing, so every value gets its source fixed and a way to prove it.

## What Changes

- The cache clock restarts at each main-loop model request, not at the turn's end. In flight while a request streams, then a countdown from the last request. A long wait inside a turn counts down, and can go cold, as it really does. The `prompt.submit` marking goes.
- The cache TTL is read from the transcript after each main request, accepted only when the line's counts match the request's. The model that answered comes from the request, never the transcript. A model change turns the state cold at once. A real compaction resets it.
- The context's red line comes from the live auto-compact threshold, read from the session's context breakdown, instead of 80% of the model window. The context reading is dropped on a real compaction instead of showing the old number until the next reply.
- The usage windows refresh while a surface is attached and the last successful fetch is over 5 minutes old. A window past its reset is re-fetched instead of hidden. A failed fetch does not count as fresh. The usage block shows a reading's age once it is over 10 minutes old. Header and endpoint percentages are rounded the same way before comparing.
- The usage block's context row names the model that answered the last request when it differs from the configured one.
- The texts stay as they are: the person tried a scale explanation on the pill hover and in the usage block and took both out. The compaction point moves the red line and the meter's scale, and is not written anywhere.
- Each value gets a proof: one debug log line per main request with the predicted value beside the actual one (the next request's cache read against the predicted warm or cold; the header against the endpoint percentage).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the cache state is counted from the last main request and can go cold inside a turn; the TTL is read per request and tied to the request; a model change or compaction ends the state; the context's red line follows the auto-compact threshold; the context reading drops on compaction; the usage windows refresh while idle and show their age; the model line names a fallback; the context scale texts on the pill hover and in the usage block.

## Impact

- `plugins/session-bar/hooks/register.tsx`: the cache atom becomes `{ sentAt, ttlMs, model, inFlight }` written from `turn.step`; `prompt.submit` no longer touches it; `session.compact` resets cache and context after the compaction ran; `session.measure` keeps the ctx reading only with a tokens figure; a breakdown read at `turn.complete` for the auto-compact threshold; `refreshUsage` keeps a success time apart from its claim; the minute tick refreshes usage when stale; `desktopSegments` and `usageRows` texts; a debug log line per main request.
- `plugins/session-bar/types/index.d.ts`: the cache atom's shape, the ctx atom's compaction threshold, the usage success time.
- `plugins/session-bar/hooks/register.test.ts`: tests for the request clock, the TTL match rule, the threshold cap, the stale refresh, the age line, the texts.
- `plugins/session-bar/.claude-plugin/plugin.json`: version 0.19.0.
- Reads the session transcript, an internal format of Claude Code, as 0.18.0 already does.
