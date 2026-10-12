# Spec Delta

## ADDED Requirements

### Requirement: Usage button opens a usage pane on Desktop
On the desktop surface the bar SHALL show a `Usage` button wherever it shows pills. Pressing it SHALL open a usage pane, and pressing it again SHALL close the pane. The pills SHALL stay non-interactive. Once Desktop answers a pane open with "not placed", the button SHALL NOT be drawn again that session.

#### Scenario: Open and close
- **WHEN** the person presses `Usage` on Desktop, then presses it again
- **THEN** the usage pane opens, then closes

#### Scenario: Calm session
- **WHEN** the desktop surface draws the bar and no segment needs attention
- **THEN** the pills and the `Usage` button show

#### Scenario: Desktop places no panes
- **WHEN** the person presses `Usage` and Desktop answers that it placed no pane
- **THEN** the button disappears and the pills stay as before

#### Scenario: Terminal unchanged
- **WHEN** the terminal surface draws the bar
- **THEN** it shows no `Usage` button and no usage pane opens

### Requirement: Usage pane content
The usage pane SHALL show one meter row for the context (when a reading exists) and one for each usage window that has a reading: 5h, 7d and each per-model weekly window. Each window row SHALL show the percent used, a tick at the share of the window already elapsed, the time left, the reset time of day, and whether usage is ahead of pace or on pace. The context row SHALL show tokens, window size and the warn and hot thresholds.

#### Scenario: Window row
- **WHEN** the 5h window is 24% used with 3h14m left and resets at 18:40
- **THEN** its row shows `24%`, a tick at the elapsed share, `resets in 3h14m`, `18:40` and `on pace`

#### Scenario: Ahead of pace
- **WHEN** a window is 71% used with 30% of its time elapsed
- **THEN** its row says `ahead of pace` and its meter uses the same vermillion as its pill

#### Scenario: Window without a reset time
- **WHEN** a window has a reading and no reset time
- **THEN** its row shows the percent and meter and no tick, countdown or reset time

#### Scenario: Context row
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** its row shows `187K of 1M`, and marks 150K as warn and 250K as hot

#### Scenario: No reading yet
- **WHEN** the context has no reading and no window has a reading
- **THEN** the pane says there is nothing to show yet

### Requirement: Pane stays current without flicker
While open, the usage pane SHALL redraw only when a reading or a pace band changes, and a countdown in it SHALL NOT cause a redraw by itself. Opening or closing it SHALL NOT redraw the bar's pills, and the button SHALL NOT make the bar flicker on send or on turn complete.

#### Scenario: Idle with the pane open
- **WHEN** the pane is open for 3 minutes with no new reading and no pace band move
- **THEN** it does not redraw

#### Scenario: Turn completes with the pane open
- **WHEN** a turn completes with the pane open and the bar shows the `Usage` button
- **THEN** the pills and the button do not flicker
