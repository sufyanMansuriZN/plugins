## MODIFIED Requirements

### Requirement: One row above the prompt
The plugin SHALL draw one row in the `AbovePrompt` band through a hooks module, on the terminal and desktop surfaces, in two zones. The left zone SHALL hold the segments repo, git, agent and model, in that order. The right zone SHALL hold the segments context, 5h, 7d and spend limit, in that order, and SHALL stand at the band's right edge. At least 3 cells SHALL stand between the zones, and all free room SHALL go between them. Within a zone, segments SHALL be joined by a dim ` · `, except that the git segment SHALL follow the repo segment inside a dim ` (` and `)`, with no ` · ` between them. Without a repo segment, the git segment SHALL stand bare. A segment with no value SHALL be left out, and a zone with no segments SHALL take no cells. Calm values SHALL use the surface's own color and labels SHALL be dim. The plugin SHALL NOT draw through Claude Code's `statusLine` setting.

#### Scenario: Every segment has a value
- **WHEN** the main conversation is in view, the session is in repo `plugins` on `main` with 3 new and 2 changed files, the model is `claude-opus-5-5` with a 1,000,000-token window, the context is 6% full, 5h is at 66% resetting in 46m and 7d at 43% resetting in 3d21h
- **THEN** the left zone reads `plugins (main +3 ~2) · Opus 5.5 1M` and the right zone reads `ctx 6% · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h`

#### Scenario: A subagent in view
- **WHEN** an `Explore` subagent's last request ran on `claude-haiku-4-5-20251001` with 42,000 input tokens and its transcript is in view
- **THEN** the left zone reads `plugins (main +3 ~2) · Explore · Haiku 4.5` and the right zone starts with `ctx 42K`

#### Scenario: Only the model is known
- **WHEN** the repo name is not known, the session is outside a git repo, the context has no percent yet and there are no rate limits
- **THEN** the left zone reads `Opus 5.5 1M` and there is no right zone

#### Scenario: No repo name
- **WHEN** the repo name is not known and the session is on `main` with 3 new and 2 changed files
- **THEN** the left zone reads `main +3 ~2 · Opus 5.5 1M`, with no parentheses

#### Scenario: A row at exactly its width
- **WHEN** `bodyColumns` is the left zone's cells, plus 3, plus the right zone's cells
- **THEN** every part shows and the row does not wrap

### Requirement: Row fits the terminal
The plugin SHALL fit the row in the band's `bodyColumns`, which already leaves out the engine's own cells, counting 3 cells between the zones when the right zone has segments. It SHALL show the windows with their meters and badges when they fit beside the whole left zone with the git segment at its width up to 12 cells, else with badges only, else bare. The git segment SHALL then be cut to the room left and end with `…`, inside its parentheses, and be left out with its parentheses when fewer than 2 cells are left. After that the repo segment SHALL be cut the same way. The agent, the model and the right zone's segments SHALL never be cut.

#### Scenario: Narrow terminal
- **WHEN** the session is in repo `plugins`, the branch is `feature/a-very-long-branch-name` with 1 new file, and `bodyColumns` is 104
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 6% · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h`

#### Scenario: Narrower still
- **WHEN** the same session has `bodyColumns` 84
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 6% · 5h 66%  behind  ↻46m · 7d 43% ↻3d21h`

#### Scenario: Too narrow for the badges
- **WHEN** the same session has `bodyColumns` 75
- **THEN** the left zone reads `plugins (feature/a-v…) · Opus 5.5 1M` and the right zone reads `ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h`

#### Scenario: The branch is cut further
- **WHEN** the same session has `bodyColumns` 65
- **THEN** the left zone reads `plugins (f…) · Opus 5.5 1M`

#### Scenario: The branch is left out
- **WHEN** the same session has `bodyColumns` 60
- **THEN** the left zone reads `plugins · Opus 5.5 1M`

#### Scenario: The repo name is cut
- **WHEN** the same session has `bodyColumns` 57
- **THEN** the left zone reads `plu… · Opus 5.5 1M`

#### Scenario: Too narrow for the gauges
- **WHEN** `bodyColumns` is 20
- **THEN** the left zone reads `Opus 5.5 1M` and the right zone reads `ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h`

## ADDED Requirements

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
