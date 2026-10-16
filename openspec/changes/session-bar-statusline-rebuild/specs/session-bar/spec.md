## ADDED Requirements

### Requirement: One status line under the prompt
The plugin SHALL show its figures as one plain-text line set through `$.ui.status`, with segments in the order git, model, context, 5h, 7d, spend limit, joined by ` · `. A segment with no value SHALL be left out. The plugin SHALL draw nothing else: no `ui.render` hook, no Desktop case, no config rows and no options.

#### Scenario: Every segment has a value
- **WHEN** the repo is on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context is 42% full, 5h is at 31% resetting in 2h10m and 7d at 12% resetting in 3d4h
- **THEN** the line reads `main +3 ~2 · Opus 5.5 1M · ctx 42% · 5h 31% ↻2h10m · 7d 12% ↻3d4h`

#### Scenario: Only the model is known
- **WHEN** the session is outside a git repo, before its first response, with no usage reading
- **THEN** the line reads the model label alone

### Requirement: Git segment
The git segment SHALL be the branch, then `+N` for untracked and added files and `~M` for modified, deleted and renamed files, each count left out at zero. A detached HEAD SHALL show the short commit sha, or `HEAD` when there is none. Outside a git repo the segment SHALL be left out. The plugin SHALL read it with one `git status --porcelain=v2 --branch` call.

#### Scenario: Clean tree
- **WHEN** the tree has no changes on branch `main`
- **THEN** the segment reads `main`

#### Scenario: Detached HEAD
- **WHEN** HEAD is detached at commit `0123456789abcdef`
- **THEN** the segment reads `0123456`

#### Scenario: Not a repo
- **WHEN** `git status` exits with an error
- **THEN** the line has no git segment

### Requirement: Model segment
The model segment SHALL be the label derived from `$.session.model()`: `claude-<name>-<ver>[-<date>][[1m]]` reads as the capitalized name and the dotted version, any other id as given. A known window size from `$.session.usage().context.window` SHALL follow it as ` 1M` or ` 200K`; with no window, a `[1m]` id SHALL read ` 1M`.

#### Scenario: Labels
- **WHEN** the id is `claude-opus-5-5[1m]`, or `claude-haiku-4-5-20251001` with a 200,000-token window, or `some-gateway-model` with a 200,000-token window
- **THEN** the segment reads `Opus 5.5 1M`, `Haiku 4.5 200K` or `some-gateway-model 200K`

### Requirement: Context segment
The context segment SHALL read `ctx <percent>%` from `$.session.usage().context.percent`, with `!` from 70% and `!!` from 85%. It SHALL be left out while the percent is absent, before the first response of a fresh or just compacted window.

#### Scenario: Marks
- **WHEN** the context is 69%, 70% or 85% full
- **THEN** the segment reads `ctx 69%`, `ctx 70%!` or `ctx 85%!!`

#### Scenario: No response yet
- **WHEN** the usage has no context percent
- **THEN** the line has no context segment

### Requirement: Usage window segments
The `five_hour`, `seven_day` and `spend_limit` windows SHALL read `5h`, `7d` and `$`, then the whole percent, a mark, and `↻<countdown>` to the reset when one is known. The countdown SHALL use at most two units (`1d7h`, `2h40m`, `12m`, `<1m`). A reading whose reset time has passed SHALL be left out. Other window kinds SHALL be ignored.

#### Scenario: Reset passed
- **WHEN** a 5h reading at 88% has a reset time before now
- **THEN** the line has no 5h segment

#### Scenario: Spend limit
- **WHEN** the reading holds a `spend_limit` at 40% with no reset time
- **THEN** the segment reads `$ 40%`

### Requirement: Usage window marks
A window with a reset time and a known length (5h, 168h) SHALL be marked by pace: with `ahead` the percent minus the share of the window gone times 100, `!!` when `ahead` is over 30 or the percent is 90 or more, `!` when `ahead` is over 15. A window without them SHALL be marked `!` from 50% and `!!` from 80%.

#### Scenario: Ahead of pace
- **WHEN** 5h is at 40% with 4h left of 5h
- **THEN** the segment reads `5h 40%! ↻4h`

#### Scenario: Behind pace
- **WHEN** 5h is at 40% with 2h left
- **THEN** the segment reads `5h 40% ↻2h`

#### Scenario: No reset time
- **WHEN** 7d is at 50% with no reset time
- **THEN** the segment reads `7d 50%!`

### Requirement: Newest usage reading wins
The plugin SHALL keep two readings of the usage windows, each stamped with when it was read: the response headers from `$.session.usage().rateLimits`, stamped at a `turn.step` or `turn.complete`, and the OAuth usage endpoint, whose `session` and `weekly_all` limits map to `five_hour` and `seven_day`. The line SHALL show the newest reading whole, with no merge per window. A header reading present at `session.start` with no response behind it SHALL count as older than any endpoint reading.

#### Scenario: A response after the fetch
- **WHEN** the endpoint answered 5h at 31% and a later response's headers say 33%
- **THEN** the 5h segment reads 33%

#### Scenario: A fetch after the response
- **WHEN** the header reading says 33% and a fetch 5 minutes later answers 45%
- **THEN** the 5h segment reads 45%

### Requirement: Usage endpoint fetch
The plugin SHALL fetch `https://api.anthropic.com/api/oauth/usage` with the session's credential handle once just after `session.start`, then at most every 5 minutes from the 30-second tick. With no credential it SHALL skip the fetch. A failed fetch SHALL keep the last good reading.

#### Scenario: Launch
- **WHEN** a session starts with no response yet
- **THEN** the endpoint's 5h and 7d readings fill the line without waiting for a turn

#### Scenario: Endpoint fails
- **WHEN** the fetch answers a non-2xx status
- **THEN** the line keeps the reading it had

### Requirement: When the line updates
The plugin SHALL rebuild the line at `session.start`, after each `turn.step` and `turn.complete`, after `session.compact`, and every 30 seconds. Git SHALL be re-read at `session.start`, `turn.complete` and each tick. It SHALL call `$.ui.status` only when the text differs from the last text it set. A failure reading git, usage or the endpoint SHALL never throw out of a hook.

#### Scenario: A response changes the usage
- **WHEN** a `turn.step` ends and the usage now has a context percent and a 5h reading
- **THEN** the line is set again with the context and 5h segments

#### Scenario: Nothing changed
- **WHEN** two steps end with the same usage
- **THEN** `$.ui.status` is called once for that text

#### Scenario: Countdowns move while idle
- **WHEN** no turn runs and a minute passes
- **THEN** the next tick sets the line with the shorter countdown

## REMOVED Requirements

### Requirement: Calm segments are plain text, attention becomes a pill
**Reason**: The status line is plain text; `!` and `!!` replace colored pills.

### Requirement: Two zones in the terminal bar
**Reason**: The band is gone; the status line is one run of segments.

### Requirement: Gauges hold their columns
**Reason**: No gauges or fixed slots in a plain-text line.

### Requirement: Secondary text in the terminal bar
**Reason**: A status line has no per-run colors.

### Requirement: Usage bars
**Reason**: The line shows percents only, no bar glyphs.

### Requirement: Reset countdown
**Reason**: Replaced by Usage window segments.

### Requirement: Pace-based attention for usage windows
**Reason**: Replaced by Usage window segments, which keep the same pace rule as marks.

### Requirement: Context size
**Reason**: Replaced by Context segment, a percent instead of tokens.

### Requirement: Context bar
**Reason**: No bars in the status line.

### Requirement: Model label
**Reason**: Replaced by Model segment.

### Requirement: Bar follows the transcript in view
**Reason**: The line shows the session's model and figures only, not a subagent in view.

### Requirement: Width adaptation
**Reason**: The engine draws the status line; the plugin no longer sheds parts by width.

### Requirement: Live countdowns between turns
**Reason**: Replaced by When the line updates.

### Requirement: Values survive gaps
**Reason**: Readings live in module variables and are read again at `session.start`; nothing is stored.

### Requirement: Git branch segment
**Reason**: Replaced by Git segment, which adds file counts.

### Requirement: Desktop shows only what the app hides
**Reason**: No Desktop drawing.

### Requirement: Desktop pills
**Reason**: No Desktop drawing.

### Requirement: Redraw only when something on screen changed
**Reason**: Replaced by When the line updates, which compares the text.

### Requirement: Desktop pills are not interactive
**Reason**: No Desktop drawing.

### Requirement: Desktop redraws only on a visible change
**Reason**: No Desktop drawing.

### Requirement: Usage button expands a usage block on Desktop
**Reason**: No usage block.

### Requirement: Usage block window rows
**Reason**: No usage block.

### Requirement: Usage block pace line
**Reason**: No usage block.

### Requirement: Usage block cap time
**Reason**: No usage block.

### Requirement: Usage block context row
**Reason**: No usage block.

### Requirement: Usage block layout
**Reason**: No usage block.

### Requirement: Usage block stays current without flicker
**Reason**: No usage block.

### Requirement: Cache state
**Reason**: The cache timer is out of scope for the status line.

### Requirement: Cache TTL from the transcript
**Reason**: No cache state, so no transcript reads.

### Requirement: Cache state in the terminal bar
**Reason**: No cache state.

### Requirement: Cache state on the Desktop context pill
**Reason**: No cache state and no Desktop drawing.

### Requirement: Cache line in the usage block
**Reason**: No cache state and no usage block.

### Requirement: Usage block row icons
**Reason**: No usage block.

### Requirement: Usage block card and meters
**Reason**: No usage block.

### Requirement: Usage reading age
**Reason**: The endpoint is fetched every 5 minutes while the session runs, so the reading is never old enough to label.

### Requirement: Cache state ends on a model change or compaction
**Reason**: No cache state.

### Requirement: Accuracy log
**Reason**: The header and endpoint comparison log goes with the old code.

### Requirement: Cache state for a session opened again
**Reason**: No cache state.

### Requirement: Context reading for a session opened again
**Reason**: The context segment reads `$.session.usage()` only and waits for the first response.

### Requirement: Desktop cache pill
**Reason**: No cache state and no Desktop drawing.
