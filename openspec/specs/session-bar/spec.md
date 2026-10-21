# session-bar Specification

## Purpose

session-bar is a mod that draws one row in the band above the prompt, for the transcript on screen: the main conversation or a subagent's. The row shows the git branch and its changes, which model that loop runs, how full the context is and how much of the account's usage windows are spent, using color only when something needs attention.

## Requirements

### Requirement: One row above the prompt
The plugin SHALL draw one row in the `AbovePrompt` band through a hooks module, on the terminal and desktop surfaces, with segments in the order git, agent, model, context, 5h, 7d, spend limit, joined by a dim ` · `. A segment with no value SHALL be left out. Calm values SHALL use the surface's own color and labels SHALL be dim. The plugin SHALL NOT draw through Claude Code's `statusLine` setting.

#### Scenario: Every segment has a value
- **WHEN** the main conversation is in view, the repo is on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context is 6% full, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the row reads `main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h`

#### Scenario: Only the model is known
- **WHEN** the session is outside a git repo, the context has no percent yet and there are no rate limits
- **THEN** the row reads `Opus 5.5 1M`

### Requirement: A survey keeps the band
While a survey holds the band (`hasSurvey`), the plugin SHALL draw nothing and leave the band to the engine.

#### Scenario: A survey shows
- **WHEN** `hasSurvey` is true
- **THEN** the band shows what the engine draws and no session-bar row

### Requirement: Git segment
The git segment SHALL be the branch, then `+N` for untracked and added files and `~M` for modified, deleted and renamed files, each count left out at zero. A detached HEAD SHALL show the short commit sha, or `HEAD` when there is none. Outside a git repo the segment SHALL be left out.

#### Scenario: Clean tree
- **WHEN** the tree has no changes on branch `main`
- **THEN** the segment reads `main`

#### Scenario: Detached HEAD
- **WHEN** HEAD is detached at commit `0123456789abcdef`
- **THEN** the segment reads `0123456`

#### Scenario: Not a repo
- **WHEN** `git status` exits with an error or cannot run
- **THEN** the row has no git segment

### Requirement: Git reading
The plugin SHALL read the git segment with `$.process.run` of `git --no-optional-locks status --porcelain=v2 --branch` in the session's directory, giving up after 2 seconds, at session start, at each turn's end and every 30 seconds.

#### Scenario: A slow repo
- **WHEN** `git status` takes longer than 2 seconds
- **THEN** the row has no git segment and the band still draws

### Requirement: Model segment
The model segment SHALL be a label made from the model id: `claude-<name>-<major>-<minor>`, with an optional `-<8-digit date>` and `[1m]`, SHALL read `<Name> <major>.<minor>`. In the main view, `$.session.model()` gives the id and the context window from `$.session.usage()` SHALL follow it as ` 1M` (a whole number of millions) or ` <n>K`. An id ending in `[1m]` SHALL read ` 1M` when no window is known. An id of any other shape SHALL show as given.

#### Scenario: Labels
- **WHEN** the id is `claude-opus-5-5` with a 1,000,000-token window, `claude-opus-5-5` with a 200,000-token window, `claude-haiku-4-5-20251001` with no window, or `claude-opus-5-5[1m]` with no window
- **THEN** the segment reads `Opus 5.5 1M`, `Opus 5.5 200K`, `Haiku 4.5` or `Opus 5.5 1M`

#### Scenario: Unknown id
- **WHEN** the id is `my-gateway-model`
- **THEN** the segment reads `my-gateway-model`

### Requirement: Context segment
In the main view the context segment SHALL read `ctx <percent>%` from `$.session.usage()`'s `context.percent`, rounded to a whole number, the value yellow from 70% and red from 85%. It SHALL be left out while the percent is absent. In a subagent's view it SHALL read `ctx <n>K`, the input tokens (uncached, cache read and cache written) of that agent's last request, in the default color, and SHALL be left out until the agent has a request with usage.

#### Scenario: Marks
- **WHEN** the context is 69%, 70% or 85% full
- **THEN** the value is in the default color, yellow or red

#### Scenario: No response yet
- **WHEN** `context.percent` is absent
- **THEN** the row has no context segment

#### Scenario: Subagent tokens
- **WHEN** a subagent's last request had 2,000 uncached, 30,000 cache-read and 10,000 cache-written input tokens and its transcript is in view
- **THEN** the context segment reads `ctx 42K`

### Requirement: Usage window segments
The `$.session.usage()` rate limits of kind `five_hour`, `seven_day` and `spend_limit` SHALL read `5h`, `7d` and `$`, then `percentUsed` rounded to a whole number, and ` ↻<countdown>` to `resetsAt` (ISO 8601) when it is set. The countdown SHALL use at most two units (`1d7h`, `2h40m`, `12m`, `<1m`). A window whose reset time has passed SHALL be left out. Other kinds SHALL be ignored. The windows are the account's, so they SHALL show in every view.

#### Scenario: Reset passed
- **WHEN** a 5h window at 88% has a reset time before now
- **THEN** the row has no 5h segment

#### Scenario: Spend limit
- **WHEN** the usage holds a `spend_limit` at 40% with no reset time
- **THEN** the segment reads `$ 40%`

### Requirement: Limits parsed at the boundary
The plugin SHALL parse each outside input where it enters: a rate limit whose `percentUsed` is not a finite number SHALL be left out, a `resetsAt` that does not parse as a time SHALL count as no reset time, a context percent that is not a finite number SHALL be left out, and a step's usage whose token counts are not finite numbers SHALL give no token reading.

#### Scenario: A percent that is not a number
- **WHEN** a `five_hour` limit has `percentUsed` `NaN`
- **THEN** the row has no 5h segment

#### Scenario: A reset time that does not parse
- **WHEN** `five_hour` is at 20% with a `resetsAt` of `"soon"`
- **THEN** the segment reads `5h 20%` with no countdown

### Requirement: Refresh schedule
The band SHALL redraw every 30 seconds through a `tick` state value that a `$.clock.every(30000)` timer bumps, so countdowns move while idle. Each `session.measure` SHALL bump `tick` too, so new usage figures draw at once. A drawing SHALL write no state.

#### Scenario: Countdowns move while idle
- **WHEN** no turn runs and a minute passes
- **THEN** the band shows the shorter countdown

### Requirement: Usage window colors
A window with a reset time and a known length (5h is 5 hours, 7d is 168 hours) SHALL be colored by pace, with `elapsed` = 1 − (reset − now) / length and `ahead` = percent − elapsed × 100: the value red when `ahead` is over 30 or the percent is 90 or more, yellow when `ahead` is over 15. A window without a reset time or a known length (the spend limit) SHALL be yellow from 50% and red from 80%. The countdown SHALL be dim.

#### Scenario: Ahead of pace
- **WHEN** 5h is at 40% with 4h left of 5h
- **THEN** `40%` is yellow

#### Scenario: Behind pace
- **WHEN** 5h is at 40% with 2h left
- **THEN** `40%` is in the default color

#### Scenario: Near the limit
- **WHEN** 5h is at 91% with 10m left
- **THEN** `91%` is red

#### Scenario: No reset time
- **WHEN** 7d is at 50% with no reset time
- **THEN** `50%` is yellow and the segment has no countdown

### Requirement: Row fits the terminal
The plugin SHALL fit the row in the band's `bodyColumns`, which already leaves out the engine's own cells. When the row is wider, the git segment SHALL be cut and end with `…`, and left out when fewer than 2 cells are left for it. The other segments SHALL never be cut.

#### Scenario: Narrow terminal
- **WHEN** the gauges take 50 cells, the branch is `feature/a-very-long-branch-name` with 1 new file and `bodyColumns` is 63
- **THEN** the row reads `feature/a… · Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h`

#### Scenario: Too narrow for the gauges
- **WHEN** `bodyColumns` is 20
- **THEN** the row has no git segment and every other segment is whole

### Requirement: Bar follows the transcript in view
The band SHALL read `e.props.view`. With the main conversation in view (no `agentId`) it SHALL show the main loop's model and context. With a subagent's transcript in view it SHALL show, after git, that agent's type from `$.agent.list()` (its `name` when it has no type match), dim, then the model its last request named, labelled with no window from the main loop, then its context as tokens. Until the agent's first request, the model and context SHALL be left out rather than show the main loop's.

#### Scenario: A Haiku subagent in view
- **WHEN** an `Explore` subagent's request ran on `claude-haiku-4-5-20251001` and its transcript is in view
- **THEN** the row holds `Explore` and `Haiku 4.5`, and no `Opus 5.5`

#### Scenario: A subagent before its first request
- **WHEN** a `Plan` subagent has made no request and its transcript is in view
- **THEN** the row holds `Plan`, no model and no context segment

#### Scenario: Back to main
- **WHEN** the person switches back to the main conversation
- **THEN** the row shows the main loop's model and context again

### Requirement: Agent readings from model requests
The plugin SHALL learn each subagent's model and input tokens from `turn.step` events that carry `agentId`: the model the step names as it starts, then the answering model and the tokens from its result. It SHALL write state only when an agent's reading changes. Steps of the main loop SHALL write nothing.

#### Scenario: A repeat step
- **WHEN** a subagent's step names the model and tokens it already has
- **THEN** no state is written
