# Design

## Context

See proposal.md for why. What the sources give, measured on 2026-10-13:

| Need | Source | Error |
|---|---|---|
| Main request send time | `turn.step` hook entry, main loop (`e.agentId` absent) | milliseconds |
| Request end, the four token counts, the model that answered | the `turn.step` result's `usage` (`TurnUsage`), after `yield*` ends | none |
| TTL of the request | transcript assistant line, `message.usage.cache_creation` split | none, but the line lands at the response's end and carries no key the hook sees |
| Cache hit of the request | `cache_read_input_tokens` of request N+1 against the total input of request N | none |
| Context tokens | `session.measure` `context.tokens`, the last request's total input; through a compaction it keeps the old count until the next reply's first step ends | lags one response, inherent |
| Compaction point | `$.session.usage({ breakdown: 'summary' })` → `breakdown.autoCompactThreshold`; `rawMaxTokens` is the window measured against | none; `summary` sends no request, `full` sends token-count requests |
| Usage windows | response headers via `session.measure`, decimals; the OAuth usage endpoint, integers | staleness only |
| Configured model | `$.session.model()` | none |
| Compaction | `session.compact` fires before the compaction, with `trigger` and `agentId`; `next(e)` resolves to the kept messages or `{ skip }` | none, once read after `next` |

Checked and ruled out: `cache_read + cache_creation > 0` is always true (one zero in 30 transcripts, as even a first request reads the shared prefix). `prompt.submit` fires for a local slash command that sends no request. No `config.set` key names the auto-compact window, and the window is per model. A scan of the 200 newest transcripts found no session that switches TTL and no response that wrote both TTLs.

## Goals / Non-Goals

**Goals:**
- Every value the bar shows is right at the moment it is drawn, or hidden, with the error bounded and stated here.
- A way to prove each value against a measurement, not an assertion.

**Non-Goals:**
- A breakpoint ladder for mixed TTLs. No transcript shows a mix; the shorter TTL wins until one does.
- A cache state for a subagent's loop, or a context reading for a subagent in view.
- Any change to the terminal layout tiers or the Desktop pill geometry.

## Decisions

1. **The cache clock is the main `turn.step`.** Enter: write `{ sentAt: now, inFlight: true }`. After `yield* next(e)`: write `inFlight: false`, the `usage` counts and `usage.model`, then read the TTL (decision 2). Between steps the countdown runs from `sentAt`, so a tool wait, a permission dialog and a foreground subagent count as idle, which they are for the cache. `prompt.submit` no longer touches the atom. Alternative: keep `turn.complete` and mark a turn active. Rejected: a wait inside a turn is unbounded, and a slash command left `active` stuck.

2. **The TTL is read after each main step and must match the step.** `tail -c 65536` of the transcript as 0.18.0 does, newest assistant line first; accept a line only when its `cache_read_input_tokens` and `input_tokens` equal the step's `usage`. A match that wrote nothing keeps the last TTL. No match (the engine has not written the line yet) keeps the last TTL and hides nothing; the next step reads again. Never take the model from the transcript, which holds `<synthetic>` lines. Alternative: `requestId`. Not in the step result.

   Spike 1.1 (2026-10-13, 9 main requests on Desktop): `turn.step` fires on Desktop and its entry clock is the send time. The result's `usage` carries the four counts and `model`. At the step's end the transcript's newest assistant line is still the previous request's, every time; this request's line is there 108–132 ms later (one 100 ms poll). The counts rule matched the right line every time. `session.measure` fires at stream end, before the hook's own code. The engine runs the response's tools without waiting for the hook's post-stream code (a tool ran before a 55 ms `tail` finished). So the TTL read is one short wait after the step, or at the next step's entry; `turn.complete` fires over 100 ms after the last step, so a read there sees the last line.

3. **Model change and compaction end the state.** At `turn.step` entry, when `e.model` differs from the stored `usage.model`, the state is cold until the step ends: the cache is keyed by model. `session.compact`: after `await next(e)`, when the result has `messages`, `e.trigger` is not `precompute` and `e.agentId` is absent, clear the cache atom and the ctx reading. Reading before `next` would reset on a compaction that never ran.

4. **The red ceiling is `min(250K, 0.8 × autoCompactThreshold)`**, the threshold read with `$.session.usage({ breakdown: 'summary' })` at each main `turn.complete` and stored on the ctx atom. Absent (auto-compact off or unread), fall back to `0.8 × window` as today. The usage block prints the threshold as the compaction point. Alternative: a `config.set` listener. No key names the window, and a model switch changes it anyway; a read per turn covers both.

   Spike 1.3 (2026-10-13): `$.session.usage({ breakdown: 'summary' })` at `turn.complete` took 691 ms and answered `autoCompactThreshold` 967,000, `rawMaxTokens` 1,000,000, `autocompactSource` `model-default` on Fable 5.1. Once per turn is fine; never per redraw. After `/autocompact 200000` the next turn's read took 41 ms and answered `autoCompactThreshold` 167,000, `rawMaxTokens` 200,000, `autocompactSource` `settings`: the threshold is the window minus a 33K buffer, so the usage block's `compacts at` figure and the red ceiling (80% of it, 134K) follow the setting with no listener.

   After `/model claude-sonnet-5-5` the turn's first request read 39,704 tokens and wrote 66,771 (the cache is keyed by model, so it starts cold), and the turn-end read answered `autoCompactThreshold` 967,000, `rawMaxTokens` 1,000,000, `autocompactSource` `model-default`. The `/autocompact` value is per model: a switch brings the default back. Task 1.3 is verified.

5. **The compact hook clears the ctx reading.** `session.measure` never reports `tokens` absent: through a compaction it repeats the old count. So decision 3's clear, after `next(e)` returns messages, is the only thing that hides the segment until the next reply's first step ends, when `session.measure` brings the new count.

   Spike 1.2 (2026-10-13, auto-compaction on Desktop after `/autocompact 200000` with the context at 289K): `compact before trigger=auto agent=- messages=265`; 94 s later a `measure` with `tokens=289322 changed=rateLimits,cost` (the summary request's headers, old count); `compact after skip=- messages=4`; then the next reply's first step ended with `measure tokens=97105 changed=context`. The summary request fired no main `turn.step` and wrote no assistant line to the transcript, so the TTL rule sees nothing from it. The first request after the compaction read 45K of its 97K from the cache (the shared prefix), so `cold` would be wrong there too: hidden is right.

6. **Usage refresh keeps two times.** `fetchedAt` stays the claim that stops overlapping fetches; a new `usageAt` in the store is written only on success and drives both the stale check and the age line. The minute tick calls `refreshUsage` when `usageAt` is over 5 minutes old and a surface is attached (`$.session.surfaces()` non-empty). A window past its reset forces one fetch past the 5-minute gate and is dropped from the atoms at that tick, and a fetch keeps only windows not yet reset, so an endpoint still answering the old window cannot force a fetch a minute. Header and endpoint percentages are rounded to a whole number before `same()`, which the pills show anyway. Alternative: refresh every tick. Rejected: a request a minute for a number that moves by the point.

7. **The answering model is a usage-block line only.** `Answered by <label>` under the context row when `usage.model` differs from `$.session.model()`. The pill and the terminal segment keep the configured model, as the person chose.

8. **Texts.** Unchanged. The pill's hover text stays `Context: 187K of 1M tokens`, then the cache part; the usage block's context row keeps `Ideal under 150K · window 1M` and its cache line, with `Answered by <label>` between them for a fallback (decision 7). A scale explanation was built on the pill hover and then in the block (`Meter full at <ceiling>…`, `compacts at <threshold>`) and the person took both out as noise. Provenance for the ceiling stays in `openspec/changes/archive/2026-10-03-session-bar-visual-redesign/research-context-size.md`; a search on 2026-10-13 found no Anthropic length split for any Claude 5 model, only Google's GraphWalks chart (Opus 5.5 90.6 under 128K, 66.8 at 256K–1M; Fable 5.1 91.4 and 65.0), seen through secondary coverage.

9. **Proof is a `$.ui.log` line per main step** behind the plugin's debug flag: predicted cache state at send, `cache_read` against the previous step's total input (hit when within 2%), ctx tokens shown against this step's total input, last header percentage against the endpoint's. Read over a few days of use; any mismatch is a bug. One idle wait past the TTL confirms refresh-on-read for the 1h entry. Alternative: a test harness. Rejected: the only truth is the live API.

## Risks / Trade-offs

- [The transcript line is written after the step result resolves] → decision 2 keeps the last TTL and retries at the next step; the first turn's state waits one request longer. Spike before coding.
- [`turn.step` is a streaming generator and the hook's budget counts its own code] → the state writes happen outside the stream, before `yield*` and after it; the TTL read is one `tail` of 5 ms.
- [The 5-minute TTL in a wait bites only API-key and credit sessions; a subscription within plan gets 1 hour] → the design is the same, the visible gain is for those sessions and for waits over an hour.
- [`session.measure` fires during a compaction with the old count (spike 1.2)] → the ctx clear lives in the compact hook only; a measure hook that cleared on a missing `tokens` would never run.
- [A fetch every 5 minutes while idle, for hours] → only while a surface is attached; a detached session makes none.
- [Mixed TTLs would overstate `cold`] → none observed; the shorter wins until a transcript shows one.
- [Terminal text flips between `❄ in use` and `❄ 59m` at each request] → accepted; the Desktop glyph has a fixed width.

## Migration Plan

Develop in `~/.claude/dev-mods/<session>/session-bar/` with the installed plugin disabled, run the proof log through real sessions, release as 0.19.0 through the marketplace, then re-enable. Rollback: `claude plugin update` to 0.18.0.

## Open Questions

- Resolved by spike 1.2: `session.measure` fires during a compaction with the old count, never with `tokens` absent. The compact hook clears the ctx reading.
- Resolved by spike 1.1: the transcript line lands about 100 ms after the step result. The TTL read waits for it or runs at the next step's entry.
