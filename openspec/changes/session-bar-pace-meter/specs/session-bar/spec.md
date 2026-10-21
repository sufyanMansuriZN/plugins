## MODIFIED Requirements

### Requirement: One row above the prompt
The plugin SHALL draw one row in the `AbovePrompt` band through a hooks module, on the terminal and desktop surfaces, with segments in the order git, agent, model, context, 5h, 7d, spend limit, joined by a dim ` · `. A segment with no value SHALL be left out. Calm values SHALL use the surface's own color and labels SHALL be dim. The plugin SHALL NOT draw through Claude Code's `statusLine` setting.

#### Scenario: Every segment has a value
- **WHEN** the main conversation is in view, the repo is on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context is 6% full, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the row reads `main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h ━━━━━──┃─ 66% ↻46m · 7d ━━━─┃──── 43% ↻3d21h`

#### Scenario: Only the model is known
- **WHEN** the session is outside a git repo, the context has no percent yet and there are no rate limits
- **THEN** the row reads `Opus 5.5 1M`

### Requirement: Usage window segments
The `$.session.usage()` rate limits of kind `five_hour`, `seven_day` and `spend_limit` SHALL read `5h`, `7d` and `$`, then the meter, then `percentUsed` rounded to a whole number, and ` ↻<countdown>` to `resetsAt` (ISO 8601) when it is set. The countdown SHALL use at most two units (`1d7h`, `2h40m`, `12m`, `<1m`). A window whose reset time has passed SHALL be left out. Other kinds SHALL be ignored. The windows SHALL show in every view.

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
- **THEN** the segment reads `5h ━━────── 20%` with no tick and no countdown

### Requirement: Usage window colors
A window with a pace SHALL color its percent green when on pace, blue when behind, yellow when ahead by 20 points or less, and red when ahead by more than 20 points or used up. A window without a reset time or a known length (the spend limit) SHALL color its percent yellow from 50% and red from 80%. Labels and the countdown SHALL be dim. Green SHALL draw as the theme's `success` and blue as `suggestion`.

#### Scenario: Ahead of pace
- **WHEN** 5h is at 70% with 2h30m left
- **THEN** `70%` is yellow

#### Scenario: Far ahead
- **WHEN** 5h is at 71% with 2h30m left
- **THEN** `71%` is red

#### Scenario: On pace
- **WHEN** 5h is at 50% with 2h30m left
- **THEN** `50%` is green

#### Scenario: Behind pace
- **WHEN** 5h is at 30% with 2h30m left
- **THEN** `30%` is blue

#### Scenario: Near the limit
- **WHEN** 5h is at 91% with 10m left
- **THEN** `91%` is blue, since an even pace would be at 96.7%

#### Scenario: No reset time
- **WHEN** 7d is at 50% with no reset time
- **THEN** `50%` is yellow and the segment has no tick and no countdown

### Requirement: Row fits the terminal
The plugin SHALL fit the row in the band's `bodyColumns`, which already leaves out the engine's own cells. It SHALL show the windows with their meters when they fit beside the git segment at its width up to 12 cells, and without them otherwise; the percent keeps its color. The git segment SHALL then be cut to the room left and end with `…`, and left out when fewer than 2 cells are left. The other segments SHALL never be cut.

#### Scenario: Narrow terminal
- **WHEN** the gauges with meters take 70 cells, the branch is `feature/a-very-long-branch-name` with 1 new file and `bodyColumns` is 85
- **THEN** the row reads `feature/a-v… · Opus 5.5 1M · ctx 6% · 5h ━━━━━──┃─ 66% ↻46m · 7d ━━━─┃──── 43% ↻3d21h`

#### Scenario: Narrower still
- **WHEN** there is no git segment and `bodyColumns` is 69
- **THEN** the row reads `Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h`

#### Scenario: Too narrow for the gauges
- **WHEN** `bodyColumns` is 20
- **THEN** the row reads `Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h` with no git segment

## ADDED Requirements

### Requirement: Usage window pace
A window with a reset time and a known length (5h is 5 hours, 7d is 168 hours) SHALL have a pace, counted around the clock, with `mark` = elapsed share of the window × 100 and `delta` = percent − mark. The pace SHALL be used up at 100% or more, else on pace when delta is within 5 points, else ahead or behind by the sign of delta.

#### Scenario: Edge of on pace
- **WHEN** 5h is at 55% or 45% with 2h30m left
- **THEN** the percent is green

#### Scenario: Just past it
- **WHEN** 5h is at 56% or 44% with 2h30m left
- **THEN** the percent is yellow or blue

#### Scenario: Used up
- **WHEN** 5h is at 100% with 2h30m left
- **THEN** the percent is red

### Requirement: Usage window meter
Each window SHALL show an 8-cell meter between its label and its percent. Cell i SHALL be filled (`━`) when its center, (i + 0.5) / 8 × 100, is at or below the percent, and empty (`─`) otherwise. Without a pace, filled cells SHALL take the percent's color and empty cells SHALL be dim.

#### Scenario: Spend limit
- **WHEN** the spend limit is at 80% with no reset time
- **THEN** the meter is `━━━━━━` red and `──` dim, with no tick

### Requirement: Pace tick
A window with a pace SHALL insert a `┃` in the default color at cell boundary round(mark / 12.5), 0 to 8, so its meter is 9 glyphs. A filled cell after the tick SHALL be in the ahead color, an empty cell before it blue, other filled cells default and the rest dim. On pace, no cell SHALL be yellow, red or blue.

#### Scenario: Ahead
- **WHEN** 5h is at 70% with 2h30m left
- **THEN** the segment reads `5h ━━━━┃━━── 70% ↻2h30m`, with `━━━━┃` in the default color, `━━` yellow and `──` dim

#### Scenario: Behind
- **WHEN** 5h is at 30% with 2h30m left
- **THEN** the segment reads `5h ━━──┃──── 30% ↻2h30m`, with `━━` in the default color, `──` blue, `┃` default and `────` dim

#### Scenario: On pace
- **WHEN** 5h is at 50% with 2h30m left
- **THEN** the segment reads `5h ━━━━┃──── 50% ↻2h30m`, with `━━━━┃` in the default color and `────` dim

#### Scenario: On pace across the tick
- **WHEN** 5h is at 57% with 2h18m left, so an even pace is at 54%
- **THEN** the meter is `━━━━┃━` in the default color and `───` dim

#### Scenario: Start of a window
- **WHEN** 5h is at 20% with 4h50m left
- **THEN** the segment reads `5h ┃━━────── 20% ↻4h50m`

#### Scenario: Near the reset
- **WHEN** 5h is at 91% with 10m left
- **THEN** the segment reads `5h ━━━━━━━─┃ 91% ↻10m`, with the empty cell blue
