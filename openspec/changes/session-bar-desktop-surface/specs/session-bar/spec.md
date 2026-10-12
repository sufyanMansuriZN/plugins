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
On the desktop surface the bar SHALL NOT show the directory or the branch, which the app shows in its changes band once a file is edited, nor the model, which the composer footer shows. It SHALL show a context or usage segment only while that segment needs attention, and nothing else. A segment that needs attention SHALL be a pill that does not rely on Powerline glyphs, with its label, value and countdown as text and without a bar.

#### Scenario: Calm session on Desktop
- **WHEN** the desktop surface draws the bar and no segment needs attention
- **THEN** the hook adds no band of its own, and no directory, branch, model, context or usage segment shows

#### Scenario: A window ahead of pace on Desktop
- **WHEN** the desktop surface draws the bar and the 5h window is 71% used with 30% of its time elapsed
- **THEN** the bar shows only a vermillion pill reading `5h 71%` with its countdown, with no bar glyphs

#### Scenario: Context past the warn point on Desktop
- **WHEN** the desktop surface draws the bar and the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** the bar shows only an orange pill reading `ctx 187K`

#### Scenario: Terminal unchanged
- **WHEN** the terminal surface draws the same session
- **THEN** the bar shows the directory, branch, model, context and usage segments as before

#### Scenario: Subagent in view on Desktop
- **WHEN** the desktop surface draws the bar with a subagent's transcript in view and the 5h window needs attention
- **THEN** the bar shows only the 5h pill, and no context segment
