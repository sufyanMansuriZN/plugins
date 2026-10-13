# Tasks

## 1. Spikes: what the engine really does

In a scratch mod outside the repo, on Desktop and in a terminal session.

- [x] 1.1 Hook `turn.step` on the main loop: toast the clock at entry, then after `yield*` the result's `usage` counts and `usage.model`, and `tail` the transcript's newest assistant line at that moment; verify over 5 requests whether the line's `cache_read_input_tokens` and `input_tokens` already match the step's, and record the answer (always, sometimes, never) and the delay in design.md
- [x] 1.2 Hook `session.measure` and `session.compact`: run `/compact`, and verify whether `session.measure` fires with `tokens` absent, and that the compact hook's `next(e)` resolves to messages for a real run and `{ skip }` or a `precompute` trigger otherwise; record which hook clears the ctx reading in design.md
- [x] 1.3 Call `$.session.usage({ breakdown: 'summary' })` at `turn.complete` and toast `autoCompactThreshold`, `rawMaxTokens` and `autocompactSource`; verify the threshold changes after `/autocompact 200k` and after a model switch, and record the read time in design.md

## 2. Cache clock on the request

Develop in `~/.claude/dev-mods/<session>/session-bar/` with the installed session-bar disabled, so each edit reloads.

- [x] 2.1 Change the `cache` atom in `types/index.d.ts` to `{ sentAt, inFlight, ttlMs?, model?, read?, input? }` and `cacheState` to count from `sentAt`, in flight while `inFlight`, hidden without `ttlMs`; verify `register.test.ts` covers every "Cache state" scenario, the long wait, the open dialog and the slash command included
- [x] 2.2 In the main-loop `turn.step` hook, write `sentAt` and `inFlight` before `yield*`, and after it the counts and model from the result's `usage`; delete the cache write from `prompt.submit` and `markCache` from `turn.complete`; verify a mount test that a subagent's step writes nothing and a prompt submit leaves the atom as it was
- [x] 2.3 Make the TTL read take the step's counts and accept only a transcript line whose `cache_read_input_tokens` and `input_tokens` match, keeping the last TTL on no match or on a response that wrote nothing; verify tests for every "Cache TTL from the transcript" scenario
- [x] 2.4 At `turn.step` entry, when `e.model` differs from the stored `model`, mark the state cold until the step ends; in `session.compact`, after `await next(e)`, clear the cache atom for a main-loop run that returned messages and was not `precompute`; verify tests for the three "Cache state ends on a model change or compaction" scenarios
- [x] 2.5 Rename the terminal, pill and usage-block texts from the turn to the request where the spec changed them, leaving the pill's alternative text as it is (the scale is explained in the usage block only, task 3.3); verify tests for the terminal, pill and usage-block cache scenarios

## 3. Context against the compaction point

- [x] 3.1 Add the auto-compact threshold to the `ctx` atom, read with `$.session.usage({ breakdown: 'summary' })` at each main `turn.complete`; make `ctxHot` the lower of 250K and 80% of the threshold when known, else 80% of the window; verify tests for the "Context size" scenarios, the smaller threshold one included
- [x] 3.2 Clear the `ctx` reading in the compact hook after `await next(e)`, with the cache atom (spike 1.2: measure repeats the old count through a compaction and never reports `tokens` absent); verify a mount test that the context segment and pill are absent after a compaction until the next reading
- [x] 3.3 Usage block context row: the texts stay as they are (a compaction-point suffix and a `Meter full at <ceiling>…` line were built and taken out again at the person's ask); verify the row's line against a threshold-capped ceiling and that the layout test still passes

## 4. Usage windows that stay current

- [x] 4.1 Add a `usageAt` store value written only on a successful fetch, keep `fetchedAt` as the claim, and round header and endpoint percentages to whole numbers before `same()`; verify tests that a failed fetch leaves `usageAt` alone and that 23.4% from a header and 23% from the endpoint do not redraw
- [x] 4.2 In the minute tick, call `refreshUsage` when a surface is attached and `usageAt` is over 5 minutes old or a stored window has reset; verify tests for the "Values survive gaps" scenarios, the idle spend one with a clock stepped 7 minutes
- [x] 4.3 Add the `Usage as of <time>` dim line under the window rows when `usageAt` is over 10 minutes old, in `resetTime`'s format; verify tests for the three "Usage reading age" scenarios

## 5. The model that answered

- [x] 5.1 Add `Answered by <label>` to the usage block's context row when the last main step's `usage.model` differs from `$.session.model()`; verify a test for the "Fallback answered" scenario and that the segment still shows the configured model

## 6. Accuracy log

- [x] 6.1 After each main step, `$.ui.log` one line pairing the state predicted at `sentAt` with this step's `cache_read` against the previous step's total input (hit within 2%), the ctx tokens shown with this step's total input, and the last header percentage with the endpoint's; verify tests for the two "Accuracy log" scenarios
- [x] 6.2 Skipped at the person's ask on 2026-10-13 (released without the day of use; the log stays in for later reading). Was: Run the hot-reloaded copy through a working day: at least one foreground subagent, one long command, one permission dialog left open, one idle wait past the TTL, one `/compact` and one model switch; verify every log line is a hit or explained, and record the counts in design.md

## 7. Live check and release

- [x] 7.1 Desktop checked by the person on 2026-10-13 ("Looks good"); the terminal and the idle 5h move are covered by tests only. Was: On the terminal and Desktop, verify the countdown runs during a long tool wait, `in use` shows only while a request streams, the pill's hover text and the usage block's context lines are unchanged, and the 5h pill moves within 7 minutes while idle after spending from another session
- [x] 7.2 Sync the spec delta into `openspec/specs/session-bar`, bump `plugin.json` to 0.19.0, release (commit, push, `claude plugin update session-bar`), remove the dev-mods copy, re-enable the installed plugin, and verify `claude plugin test` passes and a new session shows the bar

## Workflow follow-up

- Archive the change after the live check passes.
