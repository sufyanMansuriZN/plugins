# session-bar Specification

## Purpose

session-bar is a mod that draws one row in the band above the prompt, for the transcript on screen: the main conversation or a subagent's. The row shows the git branch and its changes, which model that loop runs, how full the context is and how much of the account's usage windows are spent, using color only when something needs attention.

## Requirements

### Requirement: One row above the prompt
The plugin SHALL draw one row in the `AbovePrompt` band through a hooks module, on the terminal and desktop surfaces, in two zones. The left zone SHALL hold the segments repo, git, agent and model, in that order. The right zone SHALL hold the segments context, 5h, 7d and spend limit, in that order, and SHALL stand at the band's right edge. At least 3 cells SHALL stand between the zones, and all free room SHALL go between them. The plugin SHALL NOT draw through Claude Code's `statusLine` setting.

#### Scenario: Every segment has a value
- **WHEN** the main conversation is in view, the session is in repo `plugins` on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context holds 60,000 tokens, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the left zone reads `plugins (main +3 ~2) · Opus 5.5 1M` and the right zone reads `ctx ╾─╂────── 60K · 5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h`

#### Scenario: A subagent in view
- **WHEN** an `Explore` subagent's last request ran on `claude-haiku-4-5-20251001` with 42,000 input tokens and its transcript is in view
- **THEN** the left zone reads `plugins (main +3 ~2) · Explore · Haiku 4.5` and the right zone starts with `ctx 42K`

#### Scenario: Only the model is known
- **WHEN** the repo name is not known, the session is outside a git repo, the context has no token count yet and there are no rate limits
- **THEN** the left zone reads `Opus 5.5 1M` and there is no right zone

#### Scenario: A row at exactly its width
- **WHEN** `bodyColumns` is the left zone's cells, plus 3, plus the right zone's cells
- **THEN** every part shows and the row does not wrap

### Requirement: Segment joins
Within a zone, segments SHALL be joined by a dim ` · `, except that the git segment SHALL follow the repo segment inside a dim ` (` and `)`, with no ` · ` between them. Without a repo segment, the git segment SHALL stand bare. A segment with no value SHALL be left out, and a zone with no segments SHALL take no cells. Calm values SHALL use the surface's own color and labels SHALL be dim.

#### Scenario: No repo name
- **WHEN** the repo name is not known and the session is on `main` with 3 new and 2 changed files
- **THEN** the left zone reads `main +3 ~2 · Opus 5.5 1M`, with no parentheses

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
In the main view the context segment SHALL read `ctx`, then the context meter, then the token count from `$.session.usage()`'s `context.tokens`, in thousands with a `K` (`60K`), or in millions with an `M` when it is a whole number of millions (`1M`). It SHALL be left out while the token count or the window is absent.

#### Scenario: Marks
- **WHEN** the context holds 60,000, 249,000 or 250,000 tokens of a 1,000,000-token window
- **THEN** the segment reads `ctx ╾─╂────── 60K` or `ctx ━━╉────── 249K` with the count in the default color, or `ctx ━━╉──────  250K ` with ` 250K ` in bold black on `#D55E00`

#### Scenario: No response yet
- **WHEN** `context.tokens` is absent
- **THEN** the row has no context segment

### Requirement: Subagent context
In a subagent's view the context segment SHALL read `ctx <n>K`, the input tokens (uncached, cache read and cache written) of that agent's last request, in the default color, with no meter, tick or badge, and SHALL be left out until the agent has a request with usage.

#### Scenario: Subagent tokens
- **WHEN** a subagent's last request had 2,000 uncached, 30,000 cache-read and 10,000 cache-written input tokens and its transcript is in view
- **THEN** the context segment reads `ctx 42K`

### Requirement: Usage window segments
The `$.session.usage()` rate limits of kind `five_hour`, `seven_day` and `spend_limit` SHALL read `5h`, `7d` and `$`, then the meter, then `percentUsed` rounded to a whole number, then the pace badge when there is one, and ` <countdown>` to `resetsAt` (ISO 8601) when it is set, with no mark before it. Other kinds SHALL be ignored. The windows SHALL show in every view.

#### Scenario: Spend limit
- **WHEN** the usage holds a `spend_limit` at 40% with no reset time
- **THEN** the segment reads `$ ━━━───── 40%`

### Requirement: Reset countdown
The countdown SHALL use at most two units (`1d7h`, `2h40m`, `12m`, `<1m`). A window whose reset time has passed SHALL be left out.

#### Scenario: Reset passed
- **WHEN** a 5h window at 88% has a reset time before now
- **THEN** the row has no 5h segment

### Requirement: Limits parsed at the boundary
The plugin SHALL parse each outside input where it enters: a rate limit whose `percentUsed` is not a finite number SHALL be left out, a `resetsAt` that does not parse as a time SHALL count as no reset time, a context whose `tokens` is not a finite number, or whose `window` is not a finite number above 0, SHALL be left out, and a step's usage whose token counts are not finite numbers SHALL give no token reading.

#### Scenario: A percent that is not a number
- **WHEN** a `five_hour` limit has `percentUsed` `NaN`
- **THEN** the row has no 5h segment

#### Scenario: A reset time that does not parse
- **WHEN** `five_hour` is at 20% with a `resetsAt` of `"soon"`
- **THEN** the segment reads `5h ━╾────── 20%` with no tick, no badge and no countdown

#### Scenario: A window of 0
- **WHEN** the context has 60,000 tokens and a `window` of 0
- **THEN** the row has no context segment

### Requirement: Refresh schedule
The band SHALL redraw every 30 seconds through a `tick` state value that a `$.clock.every(30000)` timer bumps, so countdowns move while idle. Each `session.measure` SHALL bump `tick` too, so new usage figures draw at once. A drawing SHALL write no state.

#### Scenario: Countdowns move while idle
- **WHEN** no turn runs and a minute passes
- **THEN** the band shows the shorter countdown

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
The plugin SHALL fit the row in the band's `bodyColumns`, which already leaves out the engine's own cells, counting 3 cells between the zones when the right zone has segments. It SHALL show the context and the windows with their meters and badges when they fit beside the whole left zone with the git segment at its width up to 12 cells, else with badges only, else bare.

#### Scenario: Narrow terminal
- **WHEN** the session is in repo `plugins`, the branch is `feature/a-very-long-branch-name` with 1 new file, the context holds 60,000 tokens of a 1,000,000-token window, and `bodyColumns` is 113
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx ╾─╂────── 60K · 5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h`

#### Scenario: Narrower still
- **WHEN** the same session has `bodyColumns` 83
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 60K · 5h 66%  behind  46m · 7d 43% 3d21h`

#### Scenario: Too narrow for the badges
- **WHEN** the same session has `bodyColumns` 74
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 60K · 5h 66% 46m · 7d 43% 3d21h`

#### Scenario: Too narrow for the gauges
- **WHEN** `bodyColumns` is 20
- **THEN** the left zone reads `Opus 5.5 1M` and the right zone reads `ctx 60K · 5h 66% 46m · 7d 43% 3d21h`

### Requirement: Left zone cut order
When the row still does not fit, the git segment SHALL be cut to the room left and end with `…`, inside its parentheses, and be left out with its parentheses when fewer than 2 cells are left. After that the repo segment SHALL be cut the same way. The agent, the model and the right zone's segments SHALL never be cut.

#### Scenario: The branch is cut further
- **WHEN** the same session has `bodyColumns` 64
- **THEN** the left zone reads `plugins (f…) · Opus 5.5 1M`

#### Scenario: The branch is left out
- **WHEN** the same session has `bodyColumns` 61
- **THEN** the left zone reads `plugins · Opus 5.5 1M`

#### Scenario: The repo name is cut
- **WHEN** the same session has `bodyColumns` 56
- **THEN** the left zone reads `plu… · Opus 5.5 1M`

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

### Requirement: Repo segment
The repo segment SHALL be the last part of the path of `$.session.repo()`'s `root`, which for a git worktree is the main working tree. When `$.session.repo()` returns null, it SHALL be the last part of the path of `$.session.cwd()`. The plugin SHALL read it at session start, at each turn's end and every 30 seconds, and SHALL write it to state only when it changes. When a read fails, the segment SHALL keep its last value, and SHALL be left out while it has none.

#### Scenario: A worktree
- **WHEN** the session runs in `/home/me/plugins/.claude/worktrees/feat-x`, a worktree of the repo at `/home/me/plugins`
- **THEN** the repo segment reads `plugins`

#### Scenario: Not a repo
- **WHEN** the session runs in `/home/me/scratch`, which is not in a git repo
- **THEN** the repo segment reads `scratch`

#### Scenario: A failed read
- **WHEN** `$.session.repo()` fails before the name was ever read
- **THEN** the row has no repo segment

### Requirement: Repo and branch colors
On the terminal surface, the parentheses and the branch name SHALL be drawn in the oh-my-zsh robbyrussell colors, as the terminal's named ANSI colors. The repo name and the counts SHALL be in the default color, since robbyrussell's cyan and yellow measure about 2:1 on the light theme. On the desktop surface all of them SHALL be in the default color, with dim parentheses. No other text SHALL have a color of its own.

#### Scenario: The terminal
- **WHEN** the session is in repo `plugins` on `main` with 3 new and 2 changed files, on the terminal surface
- **THEN** ` (` and `)` are bold blue, `main` is red, and `plugins` and ` +3 ~2` are in the default color

#### Scenario: The desktop
- **WHEN** the same session is on the desktop surface
- **THEN** `plugins`, `main` and ` +3 ~2` are in the default color, and ` (` and `)` are dim

#### Scenario: A cut into the counts
- **WHEN** the left zone has room for only `main +…` of the git segment, on the terminal surface
- **THEN** `main` is red and ` +…` is in the default color

### Requirement: Context meter
In the main view the context segment SHALL show the 8-cell meter of the Usage window meter requirement, with percent = tokens / window × 100, so a full meter is the whole model window. When the row drops the window meters, it SHALL drop the context meter too.

#### Scenario: Full window
- **WHEN** the context holds 1,000,000 tokens of a 1,000,000-token window
- **THEN** every cell of the meter is `━`

#### Scenario: A narrow band
- **WHEN** the row has no room for the meters
- **THEN** the segment reads `ctx 60K`

### Requirement: Context tick
The context meter SHALL insert a tick in the default color at cell boundary round(tick tokens / window × 8), with the arms of the Pace tick requirement. The tick tokens SHALL come from a fixed table by window: 250,000 above 200,000 tokens, where Anthropic's long-context scores drop, and 160,000 at 200,000 or less, which compacts at its edge (`openspec/changes/archive/2026-10-03-session-bar-visual-redesign/research-context-size.md`). A window smaller than its tick tokens SHALL have no tick.

#### Scenario: A 1M window
- **WHEN** the context holds 300,000 tokens of a 1,000,000-token window
- **THEN** the tick stands after cell 2 and the meter reads `━━╋╾─────`

#### Scenario: A 200K window
- **WHEN** the context holds 120,000 tokens of a 200,000-token window
- **THEN** the tick stands after cell 6 (160 / 200 × 8 = 6.4) and the meter reads `━━━━━─╂──`

#### Scenario: A window smaller than its tick
- **WHEN** the context holds 140,000 tokens of a 150,000-token window
- **THEN** the segment reads `ctx ━━━━━━━╾ 140K`, with no tick

### Requirement: Context badge
In the main view, from the tick tokens up, the token count SHALL be a badge in bold `#000000` on `#D55E00`. Below the tick tokens it SHALL be in the default color. The context SHALL have no other badge.

#### Scenario: Past the tick on a 1M window
- **WHEN** the context holds 300,000 tokens of a 1,000,000-token window
- **THEN** the segment reads `ctx ━━╋╾─────  300K `, with ` 300K ` in bold black on `#D55E00`

#### Scenario: Just below the tick
- **WHEN** the context holds 249,000 tokens of a 1,000,000-token window, or 159,000 of a 200,000-token window
- **THEN** `249K` or `159K` is in the default color

#### Scenario: A 200K window past the tick
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** the segment reads `ctx ━━━━━━╋━─  170K `, with ` 170K ` in bold black on `#D55E00`
