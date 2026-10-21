## MODIFIED Requirements

### Requirement: One row above the prompt
The plugin SHALL draw one row in the `AbovePrompt` band through a hooks module, on the terminal and desktop surfaces, in two zones. The left zone SHALL hold the segments repo, git, agent and model, in that order. The right zone SHALL hold the segments context, 5h, 7d and spend limit, in that order, and SHALL stand at the band's right edge. At least 3 cells SHALL stand between the zones, and all free room SHALL go between them. Within a zone, segments SHALL be joined by a dim ` · `, except that the git segment SHALL follow the repo segment inside a dim ` (` and `)`, with no ` · ` between them. Without a repo segment, the git segment SHALL stand bare. A segment with no value SHALL be left out, and a zone with no segments SHALL take no cells. Calm values SHALL use the surface's own color and labels SHALL be dim. The plugin SHALL NOT draw through Claude Code's `statusLine` setting.

#### Scenario: Every segment has a value
- **WHEN** the main conversation is in view, the session is in repo `plugins` on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context holds 60,000 tokens, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the left zone reads `plugins (main +3 ~2) · Opus 5.5 1M` and the right zone reads `ctx ╾─╂────── 60K · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h`

#### Scenario: A subagent in view
- **WHEN** an `Explore` subagent's last request ran on `claude-haiku-4-5-20251001` with 42,000 input tokens and its transcript is in view
- **THEN** the left zone reads `plugins (main +3 ~2) · Explore · Haiku 4.5` and the right zone starts with `ctx 42K`

#### Scenario: Only the model is known
- **WHEN** the repo name is not known, the session is outside a git repo, the context has no token count yet and there are no rate limits
- **THEN** the left zone reads `Opus 5.5 1M` and there is no right zone

#### Scenario: No repo name
- **WHEN** the repo name is not known and the session is on `main` with 3 new and 2 changed files
- **THEN** the left zone reads `main +3 ~2 · Opus 5.5 1M`, with no parentheses

#### Scenario: A row at exactly its width
- **WHEN** `bodyColumns` is the left zone's cells, plus 3, plus the right zone's cells
- **THEN** every part shows and the row does not wrap

### Requirement: Row fits the terminal
The plugin SHALL fit the row in the band's `bodyColumns`, which already leaves out the engine's own cells, counting 3 cells between the zones when the right zone has segments. It SHALL show the context and the windows with their meters and badges when they fit beside the whole left zone with the git segment at its width up to 12 cells, else with badges only, else bare. The git segment SHALL then be cut to the room left and end with `…`, inside its parentheses, and be left out with its parentheses when fewer than 2 cells are left. After that the repo segment SHALL be cut the same way. The agent, the model and the right zone's segments SHALL never be cut.

#### Scenario: Narrow terminal
- **WHEN** the session is in repo `plugins`, the branch is `feature/a-very-long-branch-name` with 1 new file, the context holds 60,000 tokens of a 1,000,000-token window, and `bodyColumns` is 115
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx ╾─╂────── 60K · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h`

#### Scenario: Narrower still
- **WHEN** the same session has `bodyColumns` 85
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 60K · 5h 66%  behind  ↻46m · 7d 43% ↻3d21h`

#### Scenario: Too narrow for the badges
- **WHEN** the same session has `bodyColumns` 76
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 60K · 5h 66% ↻46m · 7d 43% ↻3d21h`

#### Scenario: The branch is cut further
- **WHEN** the same session has `bodyColumns` 66
- **THEN** the left zone reads `plugins (f…) · Opus 5.5 1M`

#### Scenario: The branch is left out
- **WHEN** the same session has `bodyColumns` 63
- **THEN** the left zone reads `plugins · Opus 5.5 1M`

#### Scenario: The repo name is cut
- **WHEN** the same session has `bodyColumns` 58
- **THEN** the left zone reads `plu… · Opus 5.5 1M`

#### Scenario: Too narrow for the gauges
- **WHEN** `bodyColumns` is 20
- **THEN** the left zone reads `Opus 5.5 1M` and the right zone reads `ctx 60K · 5h 66% ↻46m · 7d 43% ↻3d21h`

### Requirement: Context segment
In the main view the context segment SHALL read `ctx`, then the context meter, then the token count from `$.session.usage()`'s `context.tokens`, in thousands with a `K` (`60K`), or in millions with an `M` when it is a whole number of millions (`1M`). It SHALL be left out while the token count or the window is absent. In a subagent's view it SHALL read `ctx <n>K`, the input tokens (uncached, cache read and cache written) of that agent's last request, in the default color, with no meter, tick or badge, and SHALL be left out until the agent has a request with usage.

#### Scenario: Marks
- **WHEN** the context holds 60,000, 249,000 or 250,000 tokens of a 1,000,000-token window
- **THEN** the segment reads `ctx ╾─╂────── 60K` or `ctx ━━╉────── 249K` with the count in the default color, or `ctx ━━╉──────  250K ` with ` 250K ` in bold black on `#D55E00`

#### Scenario: No response yet
- **WHEN** `context.tokens` is absent
- **THEN** the row has no context segment

#### Scenario: Subagent tokens
- **WHEN** a subagent's last request had 2,000 uncached, 30,000 cache-read and 10,000 cache-written input tokens and its transcript is in view
- **THEN** the context segment reads `ctx 42K`

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

## ADDED Requirements

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
