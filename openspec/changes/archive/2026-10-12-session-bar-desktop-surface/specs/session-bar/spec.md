# Spec Delta

## ADDED Requirements

### Requirement: Git branch segment
Inside a git repository the bar SHALL show the current branch, dimmed, after the directory as `dir (branch)`. A detached HEAD reads `HEAD`. Outside a repository, or when git fails, no branch is shown.

#### Scenario: On a branch
- **WHEN** the session runs in a repository on `main`
- **THEN** the bar starts `plugins (main)`

#### Scenario: Outside a repository
- **WHEN** the session directory is not in a git repository
- **THEN** the bar shows no branch segment

### Requirement: Desktop shows only what the app hides
On the desktop surface the bar SHALL NOT show the directory or the branch, which the app shows in its changes band once a file is edited, nor the model, which the composer footer shows. It SHALL show the context and usage segments only while at least one of them needs attention, and then all of them.

#### Scenario: Calm session on Desktop
- **WHEN** the desktop surface draws the bar and no segment needs attention
- **THEN** the hook adds no band of its own, and no directory, branch, model, context or usage segment shows

#### Scenario: One segment needs attention
- **WHEN** the desktop surface draws the bar and only the context needs attention
- **THEN** the context pill and the 5h, 7d and per-model pills all show, and only the context pill is tinted

#### Scenario: Terminal unchanged
- **WHEN** the terminal surface draws the same session
- **THEN** the bar shows the directory, branch, model, context and usage segments as before

#### Scenario: Subagent in view on Desktop
- **WHEN** the desktop surface draws the bar with a subagent's transcript in view and the 5h window needs attention
- **THEN** the usage pills show and no context pill does

### Requirement: Desktop pills
On the desktop surface each segment SHALL be a rounded pill holding a ring whose filled arc is the share used, then its text. The context pill SHALL show only its token count, with no `ctx` label. A usage pill SHALL show a dim label then a bold percentage, and only the 5h pill SHALL add its countdown. A segment needing attention SHALL be tinted orange or vermillion; a calm one SHALL be neutral.

#### Scenario: Context needing attention
- **WHEN** the context holds 213,000 tokens of a 1,000,000-token window
- **THEN** its pill is orange, shows `213K` with no `ctx` text, and its ring fills 85% of the way to the vermillion threshold

#### Scenario: Usage pills
- **WHEN** the 5h window is 15% used with 4h13m left and the 7d window is 76% used
- **THEN** the 5h pill shows `5h 15% 4h13m` and the 7d pill shows `7d 76%` with no countdown

#### Scenario: Limits left, context right
- **WHEN** the desktop surface draws the context pill and the 5h and 7d pills
- **THEN** the usage pills sit at the left edge of the row and the context pill at the right edge

#### Scenario: Limits without context
- **WHEN** a subagent's transcript is in view and only usage pills show
- **THEN** they sit at the left edge, as when the context pill is present

#### Scenario: Calm pills are neutral
- **WHEN** a pill's segment does not need attention but another does
- **THEN** that pill has a neutral fill and a gray arc

### Requirement: Desktop pill hover
On the desktop surface each pill SHALL show on hover the segment's full name, its value, its reset time where it has one, and for a usage window whether it is on pace.

#### Scenario: Usage window hover
- **WHEN** the pointer is over the 5h pill and the window is 15% used with 4h13m left and on pace
- **THEN** the hover text names the session limit, 15% used, resets in 4h13m, and on pace

#### Scenario: Context hover
- **WHEN** the pointer is over the context pill holding 213,000 tokens of a 1,000,000-token window
- **THEN** the hover text names the context and reads 213K of 1M tokens

### Requirement: Redraw only when something on screen changed
The bar SHALL be redrawn only when a reading differs from the last one, or a countdown or pace band that is on screen has moved. A reading identical to the last SHALL NOT cause a redraw, and a passing minute SHALL NOT cause one when no countdown text or pace band changed.

#### Scenario: Same reading again
- **WHEN** a measurement arrives with the same context tokens and usage percentages as the last
- **THEN** the bar is not redrawn

#### Scenario: One value moved
- **WHEN** a measurement arrives where only the context tokens differ
- **THEN** only the context reading is updated, and the usage readings are left as they were

#### Scenario: A minute with nothing to show
- **WHEN** a minute passes and no window's countdown text or pace band changed
- **THEN** the bar is not redrawn

#### Scenario: A countdown moved
- **WHEN** a minute passes and the 5h countdown changed from 2h40m to 2h39m
- **THEN** the bar is redrawn
