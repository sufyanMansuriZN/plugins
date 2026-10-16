## MODIFIED Requirements

### Requirement: One status line under the prompt
The plugin SHALL draw its figures through Claude Code's `statusLine` setting: `statusline.py` reads the statusLine JSON on stdin and prints one row, with segments in the order git, model, context, 5h, 7d, spend limit, joined by a dim ` · `. A segment with no value SHALL be left out. Calm values SHALL use the terminal's own color and labels SHALL be dim. The plugin SHALL draw nothing through the mod API.

#### Scenario: Every segment has a value
- **WHEN** the repo is on `main` with 3 new and 2 changed files, the model's display name is `Opus 5.5` with a 1,000,000-token window, the context is 6% full, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the row reads `main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h`

#### Scenario: Only the model is known
- **WHEN** the session is outside a git repo and the JSON has `used_percentage` `null` and no `rate_limits`
- **THEN** the row reads `Opus 5.5 1M`

### Requirement: Git segment
The git segment SHALL be the branch, then `+N` for untracked and added files and `~M` for modified, deleted and renamed files, each count left out at zero. A detached HEAD SHALL show the short commit sha, or `HEAD` when there is none. Outside a git repo the segment SHALL be left out. The script SHALL read it with one `git --no-optional-locks -C <workspace.current_dir> status --porcelain=v2 --branch` call that gives up after 2 seconds.

#### Scenario: Clean tree
- **WHEN** the tree has no changes on branch `main`
- **THEN** the segment reads `main`

#### Scenario: Detached HEAD
- **WHEN** HEAD is detached at commit `0123456789abcdef`
- **THEN** the segment reads `0123456`

#### Scenario: Not a repo
- **WHEN** `git status` exits with an error
- **THEN** the row has no git segment

### Requirement: Model segment
The model segment SHALL be `model.display_name` as Claude Code gives it. The window size from `context_window.context_window_size` SHALL follow it as ` 1M` or ` 200K`, unless the name already holds that size.

#### Scenario: Labels
- **WHEN** the display name is `Opus 5.5` with a 1,000,000-token window, or `Opus 5.5` with a 200,000-token window, or `Opus 4.6 (1M context)` with a 1,000,000-token window
- **THEN** the segment reads `Opus 5.5 1M`, `Opus 5.5 200K` or `Opus 4.6 (1M context)`

### Requirement: Context segment
The context segment SHALL read `ctx <percent>%` from `context_window.used_percentage`, rounded to a whole number, the value yellow from 70% and red from 85%. It SHALL be left out while the percent is `null` or absent.

#### Scenario: Marks
- **WHEN** the context is 69%, 70% or 85% full
- **THEN** the value is in the default color, yellow or red

#### Scenario: No response yet
- **WHEN** `used_percentage` is `null`
- **THEN** the row has no context segment

### Requirement: Usage window segments
The `rate_limits` windows `five_hour`, `seven_day` and `spend_limit` SHALL read `5h`, `7d` and `$`, then `used_percentage` rounded to a whole number, and ` ↻<countdown>` to `resets_at` (Unix epoch seconds) when it is set. The countdown SHALL use at most two units (`1d7h`, `2h40m`, `12m`, `<1m`). A window whose reset time has passed SHALL be left out. Other window kinds SHALL be ignored.

#### Scenario: Reset passed
- **WHEN** a 5h window at 88% has a reset time before now
- **THEN** the row has no 5h segment

#### Scenario: Spend limit
- **WHEN** the JSON holds a `spend_limit` at 40% with no reset time
- **THEN** the segment reads `$ 40%`

### Requirement: Limits parsed at the boundary
The script SHALL leave out a segment whose field is missing, not a finite number (booleans included) or of the wrong kind, and SHALL treat a `resets_at` that is not a number as no reset time.

#### Scenario: A percent that is not a number
- **WHEN** `five_hour.used_percentage` is `null` and `context_window.used_percentage` is the string `"6"`
- **THEN** the row has neither a 5h nor a context segment

#### Scenario: A reset time that does not parse
- **WHEN** `five_hour` is at 20% with a `resets_at` of `"soon"`
- **THEN** the segment reads `5h 20%` with no countdown

## ADDED Requirements

### Requirement: Refresh schedule
Claude Code SHALL run the script on its own events and every 30 seconds, from `refreshInterval: 30` in the `statusLine` setting that `/session-bar:setup` writes. The script SHALL keep no state between runs.

#### Scenario: Countdowns move while idle
- **WHEN** no turn runs and a minute passes
- **THEN** the next run prints the shorter countdown

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
The script SHALL fit the row in `COLUMNS` minus 4 cells, the cells Claude Code keeps free at the edges. When the row is wider, the git segment SHALL be cut and end with `…`, and left out when fewer than 2 cells are left for it. The other segments SHALL never be cut.

#### Scenario: Narrow terminal
- **WHEN** `COLUMNS` is 80 and the branch is `worktree-agent-a5c2eb6e2b1a239f6` with 2 new files
- **THEN** the row reads `worktree-agent-a5c2eb6… · Opus 5.5 1M · ctx 6% · 5h 69% ↻32m · 7d 44% ↻3d20h`

#### Scenario: Too narrow for the gauges
- **WHEN** `COLUMNS` is 20
- **THEN** the row has no git segment and every other segment is whole

### Requirement: Bad input prints nothing
When stdin is not a JSON object, or anything else fails, the script SHALL print nothing and exit 0.

#### Scenario: Malformed JSON
- **WHEN** stdin is `{bad`
- **THEN** the script prints nothing to stdout or stderr and exits 0

### Requirement: Setup command
`/session-bar:setup` SHALL run `setup.py`, which writes `statusLine` = `{"type": "command", "command": "python3 <script>", "refreshInterval": 30}` into `settings.json` under `$CLAUDE_CONFIG_DIR`, or `~/.claude` when it is unset. `<script>` SHALL be the `statusline.py` under `plugins/marketplaces/*/plugins/session-bar/` whose marketplace manifest lists `session-bar`, preferring the marketplace the plugin is installed from; never the versioned cache. Setup SHALL print what it did.

#### Scenario: No marketplace copy
- **WHEN** no marketplace holds `session-bar/statusline.py`
- **THEN** setup names the marketplace update and plugin update commands to run, leaves `settings.json` as it was and exits 1

### Requirement: Setup keeps the user's settings
Before it writes, setup SHALL check `python3` is on `PATH`, and SHALL save a `statusLine` that does not run session-bar to `session-bar/previous-statusline.json`. It SHALL keep every other key in its order and write JSON with a 2-space indent. Settings that are not a JSON object SHALL be left as they are.

#### Scenario: Fresh settings
- **WHEN** there is no `settings.json`
- **THEN** setup writes one that holds only session-bar's `statusLine`

#### Scenario: Another statusLine
- **WHEN** `statusLine` runs `~/bin/my-statusline.sh`
- **THEN** setup saves it to `previous-statusline.json`, says so, and writes session-bar's

#### Scenario: Second run
- **WHEN** setup runs again
- **THEN** `settings.json` is byte for byte the same and setup says nothing changed

### Requirement: Remove command
`/session-bar:remove` SHALL run `setup.py --remove`. When `statusLine` runs session-bar, it SHALL put back the saved `statusLine` and delete the saved file, or remove the key when none was saved. When `statusLine` does not run session-bar, it SHALL change nothing.

#### Scenario: Restore
- **WHEN** setup saved `~/bin/my-statusline.sh` and remove runs
- **THEN** `statusLine` runs `~/bin/my-statusline.sh` again and every other key is as it was

### Requirement: Setup hint
A SessionStart hook on `startup` SHALL show the user `session-bar: run /session-bar:setup once to show the status line.` as a `systemMessage`, which does not reach the model, while `statusLine` in `settings.json` does not run an existing session-bar script. Once it does, the hook SHALL print nothing.

#### Scenario: After an update from 1.0.0
- **WHEN** a session starts and `settings.json` has no `statusLine`
- **THEN** the user sees the hint line once at startup

#### Scenario: After setup
- **WHEN** `statusLine` runs the marketplace `statusline.py`
- **THEN** the hook prints nothing

## REMOVED Requirements

### Requirement: Usage window marks
**Reason**: Color replaces the `!` and `!!` marks; see Usage window colors.

### Requirement: Newest usage reading wins
**Reason**: Usage comes from `rate_limits` in the statusLine JSON alone; there is no second reading.

### Requirement: Reading stamps
**Reason**: There is one reading per run, so nothing to stamp.

### Requirement: Usage endpoint fetch
**Reason**: The plugin no longer fetches the OAuth usage endpoint.

### Requirement: Endpoint retry
**Reason**: The plugin no longer fetches the OAuth usage endpoint.

### Requirement: Hooks do not wait on reads
**Reason**: There are no mod hooks; Claude Code runs the script on its own schedule.

### Requirement: When the line updates
**Reason**: Claude Code decides when the script runs; see Refresh schedule. The script keeps no last text to compare.
