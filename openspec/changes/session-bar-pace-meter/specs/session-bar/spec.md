## MODIFIED Requirements

### Requirement: One row above the prompt
The plugin SHALL draw one row in the `AbovePrompt` band through a hooks module, on the terminal and desktop surfaces, with segments in the order git, agent, model, context, 5h, 7d, spend limit, joined by a dim ` · `. A segment with no value SHALL be left out. Calm values SHALL use the surface's own color and labels SHALL be dim. The plugin SHALL NOT draw through Claude Code's `statusLine` setting.

#### Scenario: Every segment has a value
- **WHEN** the main conversation is in view, the repo is on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context is 6% full, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the row reads `main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h`

#### Scenario: Only the model is known
- **WHEN** the session is outside a git repo, the context has no percent yet and there are no rate limits
- **THEN** the row reads `Opus 5.5 1M`

### Requirement: Context segment
In the main view the context segment SHALL read `ctx <percent>%` from `$.session.usage()`'s `context.percent`, rounded to a whole number. From 70% the percent SHALL be a badge on yellow, from 85% on red, and below 70% plain. It SHALL be left out while the percent is absent. In a subagent's view it SHALL read `ctx <n>K`, the input tokens (uncached, cache read and cache written) of that agent's last request, in the default color, and SHALL be left out until the agent has a request with usage.

#### Scenario: Marks
- **WHEN** the context is 69%, 70% or 85% full
- **THEN** the segment reads `ctx 69%` in the default color, `ctx  70% ` with ` 70% ` in bold black on `#E69F00`, or `ctx  85% ` with ` 85% ` in bold black on `#D55E00`

#### Scenario: No response yet
- **WHEN** `context.percent` is absent
- **THEN** the row has no context segment

#### Scenario: Subagent tokens
- **WHEN** a subagent's last request had 2,000 uncached, 30,000 cache-read and 10,000 cache-written input tokens and its transcript is in view
- **THEN** the context segment reads `ctx 42K`

### Requirement: Usage window segments
The `$.session.usage()` rate limits of kind `five_hour`, `seven_day` and `spend_limit` SHALL read `5h`, `7d` and `$`, then the meter, then `percentUsed` rounded to a whole number, then the pace badge when there is one, and ` <countdown>` to `resetsAt` (ISO 8601) when it is set, with no mark before it. The countdown SHALL use at most two units (`1d7h`, `2h40m`, `12m`, `<1m`). A window whose reset time has passed SHALL be left out. Other kinds SHALL be ignored. The windows SHALL show in every view.

#### Scenario: Reset passed
- **WHEN** a 5h window at 88% has a reset time before now
- **THEN** the row has no 5h segment

#### Scenario: Spend limit
- **WHEN** the usage holds a `spend_limit` at 40% with no reset time
- **THEN** the segment reads `$ ━━━───── 40%`

### Requirement: Limits parsed at the boundary
The plugin SHALL parse each outside input where it enters: a rate limit whose `percentUsed` is not a finite number SHALL be left out, a `resetsAt` that does not parse as a time SHALL count as no reset time, a context percent that is not a finite number SHALL be left out, and a step's usage whose token counts are not finite numbers SHALL give no token reading.

#### Scenario: A percent that is not a number
- **WHEN** a `five_hour` limit has `percentUsed` `NaN`
- **THEN** the row has no 5h segment

#### Scenario: A reset time that does not parse
- **WHEN** `five_hour` is at 20% with a `resetsAt` of `"soon"`
- **THEN** the segment reads `5h ━╾────── 20%` with no tick, no badge and no countdown

### Requirement: Usage window colors
Color SHALL show only as a badge's background, behind bold `#000000` text. No other text, cell or tick SHALL be in color. A window with a pace SHALL draw its percent in the default color. A window without a reset time or a known length (the spend limit) SHALL show its percent as a badge on yellow from 50% and on red from 80%, and plain below 50%. Labels and the countdown SHALL be dim. Yellow SHALL be `#E69F00`, red `#D55E00` and blue `#56B4E9`, fixed in every theme.

#### Scenario: Ahead of pace
- **WHEN** 5h is at 40% with 4h left of 5h
- **THEN** `40%` and every cell are in the default color or dim, and ` ahead ` follows the percent

#### Scenario: Behind pace
- **WHEN** 5h is at 40% with 2h left
- **THEN** `40%` is in the default color and ` behind ` follows it

#### Scenario: Near the limit
- **WHEN** 5h is at 91% with 10m left
- **THEN** `91%` is in the default color, since the pace is in its badge

#### Scenario: No reset time
- **WHEN** 7d is at 50% with no reset time
- **THEN** the percent shows as ` 50% ` in bold black on `#E69F00`, and the segment has no tick, no pace badge and no countdown

#### Scenario: Spend limit below 50%
- **WHEN** the spend limit is at 49%
- **THEN** `49%` is in the default color, with no badge

#### Scenario: Spend limit near its end
- **WHEN** the spend limit is at 80%
- **THEN** the segment reads `$ ━━━━━━╾─  80% `, with ` 80% ` in bold black on `#D55E00`, `━━━━━━╾` in the default color and `─` dim

### Requirement: Row fits the terminal
The plugin SHALL fit the row in the band's `bodyColumns`, which already leaves out the engine's own cells. It SHALL show the windows with their meters and badges when they fit beside the git segment at its width up to 12 cells, else with badges only, else bare. The git segment SHALL then be cut to the room left and end with `…`, and left out when fewer than 2 cells are left. The other segments SHALL never be cut.

#### Scenario: Narrow terminal
- **WHEN** the gauges with meters take 77 cells, the branch is `feature/a-very-long-branch-name` with 1 new file and `bodyColumns` is 92
- **THEN** the row reads `feature/a-v… · Opus 5.5 1M · ctx 6% · 5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h`

#### Scenario: Narrower still
- **WHEN** there is no git segment and `bodyColumns` is 76
- **THEN** the row reads `Opus 5.5 1M · ctx 6% · 5h 66%  behind  46m · 7d 43% 3d21h`

#### Scenario: Too narrow for the badges
- **WHEN** there is no git segment and `bodyColumns` is 56
- **THEN** the row reads `Opus 5.5 1M · ctx 6% · 5h 66% 46m · 7d 43% 3d21h`

#### Scenario: Too narrow for the gauges
- **WHEN** `bodyColumns` is 20
- **THEN** the row reads `Opus 5.5 1M · ctx 6% · 5h 66% 46m · 7d 43% 3d21h` with no git segment

## ADDED Requirements

### Requirement: Usage window pace
A window with a reset time and a known length (5h is 5 hours, 7d is 168 hours) SHALL have a pace, counted around the clock, with `mark` = elapsed share of the window × 100 and `delta` = percent − mark. The pace SHALL be used up at 100% or more, else on pace when delta is within 5 points, else ahead or behind by the sign of delta. Ahead by more than 20 points SHALL be far ahead.

#### Scenario: Edge of on pace
- **WHEN** 5h is at 55% or 45% with 2h30m left
- **THEN** the segment has no badge

#### Scenario: Just past it
- **WHEN** 5h is at 56% or 44% with 2h30m left
- **THEN** the badge is ` ahead ` or ` behind `

#### Scenario: Used up
- **WHEN** 5h is at 100% with 2h30m left
- **THEN** the badge is ` used up `

### Requirement: Pace badge
A window that is ahead, far ahead, behind or used up SHALL show a dim space and then a badge after its percent: ` ahead ` on `#E69F00`, ` far ahead ` on `#D55E00`, ` behind ` on `#56B4E9`, ` used up ` on `#D55E00`, each in bold `#000000` text. A window on pace SHALL show no badge. The word SHALL carry the pace on its own, so no meaning rests on telling the colors apart.

#### Scenario: Ahead
- **WHEN** 5h is at 70% with 2h30m left
- **THEN** ` ahead ` follows `70%`, in bold black on `#E69F00`

#### Scenario: Far ahead
- **WHEN** 5h is at 71% with 2h30m left
- **THEN** ` far ahead ` follows `71%`, in bold black on `#D55E00`

#### Scenario: Behind
- **WHEN** 5h is at 91% with 10m left, so an even pace is at 96.7%
- **THEN** ` behind ` follows `91%`, in bold black on `#56B4E9`

### Requirement: Usage window meter
Each window SHALL show an 8-cell meter between its label and its percent. With halves = round(percent / 100 × 16), capped at 16, cell i SHALL be `━` when halves > 2i + 1, `╾` when halves = 2i + 1, and `─` otherwise. Unused cells SHALL be dim and every other cell SHALL be in the default color.

#### Scenario: Half a cell
- **WHEN** the spend limit is at 6%, then at 19%
- **THEN** the meter is `╾───────`, then `━╾──────`

#### Scenario: Spend limit
- **WHEN** the spend limit is at 80% with no reset time
- **THEN** the meter is `━━━━━━╾` in the default color and `─` dim, with no tick

### Requirement: Pace tick
A window with a pace SHALL insert a tick in the default color at cell boundary round(mark / 12.5), 0 to 8. Its left arm SHALL be heavy when the cell before it is `━`, its right arm heavy when the cell after it is `━` or `╾`, light beside any other cell, and absent at an end. Whatever the pace, no cell SHALL be in color: the used cells after the tick show the overspend by their place, and the badge names it.

#### Scenario: Ahead
- **WHEN** 5h is at 70% with 2h30m left
- **THEN** the segment reads `5h ━━━━╋━╾── 70%  ahead  2h30m`, with `━━━━╋━╾` in the default color and `──` dim

#### Scenario: Behind
- **WHEN** 5h is at 30% with 2h30m left
- **THEN** the segment reads `5h ━━╾─╂──── 30%  behind  2h30m`, with `━━╾` and `╂` in the default color and every `─` dim

#### Scenario: On pace
- **WHEN** 5h is at 50% with 2h30m left
- **THEN** the segment reads `5h ━━━━╉──── 50% 2h30m`, with `━━━━╉` in the default color and `────` dim

#### Scenario: A half cell beside the tick
- **WHEN** 5h is at 46%, then at 54%, with 2h30m left
- **THEN** the meter is `━━━╾╂────`, then `━━━━╋╾───`

#### Scenario: Start of a window
- **WHEN** 5h is at 20% with 4h50m left
- **THEN** the segment reads `5h ┣━╾────── 20%  ahead  4h50m`

#### Scenario: Near the reset
- **WHEN** 5h is at 91% with 10m left
- **THEN** the segment reads `5h ━━━━━━━╾┨ 91%  behind  10m`
