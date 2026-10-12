# session-bar Specification

## Purpose

The session bar is the band above the prompt that shows where the session is, which model it runs, how full the context is and how much of the account's usage windows are spent, using color only when something needs attention.

## Requirements

### Requirement: Calm segments are plain text, attention becomes a pill
The bar SHALL draw each calm segment (directory, model, context, each usage window) as plain text in the terminal's own colors, with labels dimmed. A segment that needs attention SHALL become a pill with rounded caps, filled orange or vermillion, with dark text, so it reads on light and dark terminals alike.

#### Scenario: Calm session
- **WHEN** no segment needs attention
- **THEN** no segment carries a background or an explicit text color

#### Scenario: One window needs attention
- **WHEN** only the 5h window is ahead of pace
- **THEN** only the 5h segment is a pill, and every run inside it sits on the pill's fill

### Requirement: Usage bars
The 5h, 7d and per-model weekly segments SHALL show a bar of 10 cells (one per 10%) at half-cell steps before their percentage: heavy `━` for the used part, light `─` for the rest, and `╾` for a half step between them. The parts SHALL differ in line weight, so the bar reads without relying on color.

#### Scenario: Partial fill
- **WHEN** the 5h window reads 23.4% used
- **THEN** its bar reads `━━╾───────` followed by `23%`

#### Scenario: Whole cells
- **WHEN** a window reads 20% used
- **THEN** its bar reads `━━────────`

### Requirement: Reset countdown
A usage window with a known reset time SHALL show the time left until it resets, dimmed, as at most two units: `2h40m`, `1d7h`, `12m`.

#### Scenario: Hours and minutes
- **WHEN** the 5h window resets in 2 hours 40 minutes
- **THEN** the 5h segment shows `2h40m`

#### Scenario: Days and hours
- **WHEN** the 7d window resets in 1 day 7 hours 20 minutes and the full bar fits
- **THEN** the 7d segment shows `1d7h`

### Requirement: Pace-based attention for usage windows
A usage window with a known reset time SHALL turn orange when its used percentage exceeds the elapsed percentage by more than 15 points, and red when it exceeds it by more than 30 points or reaches 90% used. A window without a reset time SHALL fall back to orange from 50% and red from 80%.

#### Scenario: High usage late in the week
- **WHEN** the 7d window is 61% used with 80% of the week elapsed
- **THEN** the 7d segment stays plain

#### Scenario: Burning ahead of pace
- **WHEN** the 5h window is 71% used with 30% of its time elapsed
- **THEN** the 5h segment is a vermillion pill

#### Scenario: Near the cap
- **WHEN** a window is 92% used with 95% of its time elapsed
- **THEN** its segment is a vermillion pill

#### Scenario: No reset time
- **WHEN** a window without a reset time reads 55%
- **THEN** its segment is an orange pill

### Requirement: Context size
The context segment SHALL show the context's input tokens (e.g. `187K`), labelled `ctx`. It SHALL turn orange from 150K tokens, and vermillion from the lower of 250K tokens and 80% of the window. It SHALL be hidden until the session has a reading, and hidden while a subagent's transcript is in view.

#### Scenario: Comfortable on a 1M window
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** the context segment shows `ctx`, a bar and `120K`, as plain text

#### Scenario: Past the compaction point on a 1M window
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** the context segment shows `187K` in an orange pill

#### Scenario: A 200K window caps the red threshold
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** the context segment shows `170K` in a vermillion pill

#### Scenario: Fresh session
- **WHEN** no response has landed yet
- **THEN** no context segment is drawn

#### Scenario: Subagent in view
- **WHEN** a subagent's transcript is in view and the main loop's context holds 187,400 tokens
- **THEN** no context segment is drawn

### Requirement: Context bar
The context segment SHALL show a bar before its token count that runs from 0 to its vermillion threshold, so a full bar means vermillion. It SHALL use the usage bars' glyphs, cell counts and half-cell steps, clamped at full. The cell holding the orange threshold SHALL be a tick whose horizontal stroke keeps the weight of the cell it replaces: `┿` on a used cell, `┼` on a remaining cell, and `┽` on the half-filled cell. The tick SHALL be drawn like the used part once the fill reaches that cell and dimmed like the rest before that.

#### Scenario: Below the warn tick
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━─┼───`

#### Scenario: Fill ends on the tick's cell
- **WHEN** the context holds 160,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━━┽───`

#### Scenario: Past the warn tick
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━━┿╾──`

#### Scenario: Past the vermillion threshold
- **WHEN** the context holds 260,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━━┿━━━`

#### Scenario: A 200K window shortens the scale
- **WHEN** the context holds 80,000 tokens of a 200,000-token window
- **THEN** its bar runs to 160,000 tokens and reads `━━━━━────┼`

#### Scenario: Short bars
- **WHEN** the bar is drawn at 5 cells with 120,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━╾┼─`

### Requirement: Model label
The model segment SHALL show the model's name and version (e.g. `Opus 5.5`) followed by the context window size once the session has a context reading (e.g. `Opus 5.5 1M`). Before that, it SHALL show `1M` only when the model ID names the 1M window (`[1m]`). For a subagent in view, it SHALL name the model of that subagent's latest model request, with `1M` only when that model ID names it, and SHALL be left out until the subagent has made a request.

#### Scenario: Window from the context reading
- **WHEN** the model ID is `claude-opus-5-5` and the context reports a 1,000,000-token window
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: A 200K window
- **WHEN** the model ID is `claude-haiku-4-5-20251001` and the context reports a 200,000-token window
- **THEN** the model segment shows `Haiku 4.5 200K`

#### Scenario: No reading yet
- **WHEN** no response has landed and the model ID is `claude-opus-5-5[1m]`
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: Subagent takes no window from main
- **WHEN** a subagent in view runs `claude-sonnet-5-5` and the main loop's context reports a 1,000,000-token window
- **THEN** the model segment shows `Sonnet 5.5`

#### Scenario: Subagent before its first request
- **WHEN** a `Plan` subagent's transcript is in view and it has made no model request yet
- **THEN** the bar starts `plugins · Plan` and names no model

### Requirement: Bar follows the transcript in view
The bar SHALL describe the loop whose transcript is on screen. With a subagent's transcript open from the tasks list, the directory segment SHALL be followed by that subagent's agent type and then its model segment. Switching back to the main conversation SHALL restore the main bar. Usage windows SHALL show in every view, since they belong to the account.

#### Scenario: Subagent in view
- **WHEN** the person opens the transcript of an `Explore` subagent whose requests name `claude-haiku-4-5-20251001`
- **THEN** the bar starts `plugins · Explore · Haiku 4.5`

#### Scenario: Back to main
- **WHEN** the person returns from a subagent's transcript to the main conversation running `claude-opus-5-5` with a 1,000,000-token window
- **THEN** the bar starts `plugins · Opus 5.5 1M` and shows the context segment again

#### Scenario: Usage windows in a subagent's view
- **WHEN** a subagent's transcript is in view and the 5h window reads 41% used
- **THEN** the 5h segment shows as it does in the main view

### Requirement: Width adaptation
The bar SHALL fit on one row of the band's width when it can. When the full bar does not fit, it SHALL drop the 7d and per-model weekly countdowns first, then shorten the bars to 5 cells (one per 20%), then drop the bars, then drop the 5h countdown.

#### Scenario: Wide terminal
- **WHEN** the full bar fits the band's width
- **THEN** 10-cell bars and every countdown show

#### Scenario: Medium terminal
- **WHEN** the full bar is too wide but fits without the weekly countdowns
- **THEN** 10-cell bars and the 5h countdown show, and the 7d and per-model weekly countdowns do not

#### Scenario: Narrower terminal
- **WHEN** only the form with 5-cell bars fits
- **THEN** 5-cell bars and the 5h countdown show, and the weekly countdowns do not

#### Scenario: Narrow terminal
- **WHEN** nothing with bars fits, but the form without bars does
- **THEN** the bar shows `dir · model   ctx 120K   5h 23% 2h40m   7d 61%` with attention pills where needed

#### Scenario: Narrowest terminal
- **WHEN** even the form without bars is too wide
- **THEN** the bar shows `dir · model   ctx 120K   5h 23%   7d 61%`

### Requirement: Live countdowns between turns
The bar SHALL redraw at least once a minute so countdowns and pace colors stay current while no turn runs.

#### Scenario: Idle session
- **WHEN** no turn runs for 3 minutes
- **THEN** the 5h countdown has dropped by 3 minutes

### Requirement: Values survive gaps
The bar SHALL draw the last known usage readings, from this session or an earlier one, until a fresh reading arrives. It SHALL drop a reading whose window has already reset.

#### Scenario: Launch before any response
- **WHEN** a session starts and an earlier session stored 5h and 7d readings whose windows have not reset
- **THEN** the bar shows those readings before the first response

#### Scenario: Stale window
- **WHEN** a stored 5h reading's reset time has passed
- **THEN** the 5h segment is not drawn from it

### Requirement: Git branch segment
Inside a git repository the bar SHALL show the current branch, dimmed, after the directory as `dir (branch)`. A detached HEAD reads `HEAD`. Outside a repository, or when git fails, no branch is shown.

#### Scenario: On a branch
- **WHEN** the session runs in a repository on `main`
- **THEN** the bar starts `plugins (main)`

#### Scenario: Outside a repository
- **WHEN** the session directory is not in a git repository
- **THEN** the bar shows no branch segment

### Requirement: Desktop shows only what the app hides
On the desktop surface the bar SHALL NOT show the directory or the branch, which the app shows in its changes band once a file is edited, nor the model, which the composer footer shows. It SHALL always show a pill for each context and usage reading that exists, tinting those that need attention and leaving the rest neutral. A pill whose reading is absent SHALL be skipped.

#### Scenario: Calm session on Desktop
- **WHEN** the desktop surface draws the bar and no segment needs attention
- **THEN** the context and usage pills show, all neutral, and no directory, branch or model shows

#### Scenario: One segment needs attention
- **WHEN** the desktop surface draws the bar and only the context needs attention
- **THEN** the context pill and the 5h, 7d and per-model pills all show, and only the context pill is tinted

#### Scenario: No reading yet
- **WHEN** the desktop surface draws the bar with no context reading and an expired 5h window
- **THEN** only the pills that have a reading show, and no placeholder is drawn

#### Scenario: Terminal unchanged
- **WHEN** the terminal surface draws the same session
- **THEN** the bar shows the directory, branch, model, context and usage segments as before

#### Scenario: Subagent in view on Desktop
- **WHEN** the desktop surface draws the bar with a subagent's transcript in view
- **THEN** the usage pills show and no context pill does

### Requirement: Desktop pills
On the desktop surface each segment SHALL be a rounded pill holding an icon that identifies the segment, then its text. The pill background SHALL fill from the left edge to the share used. The context, the 5h window, the 7d window and a per-model weekly window SHALL each have a different icon. Icons and text SHALL use the theme's text colors, never a color of their own. The context pill SHALL show only its token count, with no `ctx` label. A usage pill SHALL show a dim label then the percentage in the primary ink, both at regular weight. No pill SHALL show a countdown. A calm usage window SHALL have a hue of its own, the same in its pill and its usage block meter: blue for the 5h window, green for the 7d window, and purple for a per-model weekly window, none near amber or red. A calm context SHALL be gray. A segment needing attention SHALL be amber (warn) or red (hot) in place of its own color, in a translucent tone that reads on light and dark surfaces. The pills and the usage button SHALL always fit one row and never wrap: where the bar is too narrow, the pills SHALL drop their labels first, then the usage button its name, and their icons last.

#### Scenario: Pills shed parts to fit one row
- **WHEN** the desktop bar has 161, 55, 44 and then 33 cells
- **THEN** the pills show icon, label and value; then icon and value; then icon and value beside a `⤢` button; then values only, each time on one row

#### Scenario: Context needing attention
- **WHEN** the context holds 213,000 tokens of a 1,000,000-token window
- **THEN** its pill is red, shows `213K` with no `ctx` text, shows the context icon, and its fill reaches 85% of the pill, the share of the vermillion threshold

#### Scenario: Usage pills
- **WHEN** the 5h window is 15% used with 4h13m left and the 7d window is 76% used
- **THEN** the 5h pill shows `5h 15%` and the 7d pill shows `7d 76%`, and neither shows `4h13m`

#### Scenario: Each segment has its own icon
- **WHEN** the desktop surface draws the context, 5h, 7d and a per-model weekly pill
- **THEN** the four pills show four different icons, all in the theme's text color

#### Scenario: Color means severity
- **WHEN** one pill is warn, one is hot and one is a calm 7d window
- **THEN** the warn pill is amber, the hot pill is red, the calm 7d pill is green, and their icons and text keep the same ink

#### Scenario: Fill shows the share
- **WHEN** a usage window is 41% used
- **THEN** the left 41% of its pill is filled a shade darker than the rest

#### Scenario: Limits left, context right
- **WHEN** the desktop surface draws the context pill and the 5h and 7d pills
- **THEN** the usage pills sit at the left edge of the row and the context pill at the right edge

#### Scenario: Limits without context
- **WHEN** a subagent's transcript is in view and only usage pills show
- **THEN** they sit at the left edge, as when the context pill is present

#### Scenario: Calm pills are neutral
- **WHEN** a pill's segment does not need attention but another does
- **THEN** that pill has a neutral background and a fill in its own hue, gray for the context

### Requirement: Redraw only when something on screen changed
The bar SHALL be redrawn only when a reading differs from the last one, or a countdown or pace band that is on screen has moved. A reading identical to the last SHALL NOT cause a redraw, and neither SHALL a passing minute with no countdown text or pace band changed, nor a usage fetch that stores only its own bookkeeping.

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

#### Scenario: Usage fetch finds nothing new
- **WHEN** the 5-minute usage fetch runs and returns the same limits as the last
- **THEN** the bar is not redrawn, and the next fetch still waits out the 5-minute window

### Requirement: Desktop pills are not interactive
On the desktop surface no pill SHALL be an interactive element, so that the bar stays steady when a prompt is sent and when a turn completes. A pill SHALL still carry its segment text as alternative text.

#### Scenario: No pill responds to hover
- **WHEN** the pointer is over any pill
- **THEN** no hover text shows

#### Scenario: Steady on send and turn complete
- **WHEN** a prompt is sent, and when a turn completes
- **THEN** the pills do not flicker

### Requirement: Desktop redraws only on a visible change
When Desktop is the only surface on the session, the minute tick SHALL redraw the bar only when a pill's pace band moved, because no countdown is drawn on Desktop. When the terminal surface is also on the session, the tick SHALL also redraw for a countdown change, as before.

#### Scenario: A quiet minute on Desktop
- **WHEN** a minute passes, the 5h countdown drops from `4h13m` to `4h12m`, and no pace band moved
- **THEN** the tick does not redraw the bar

#### Scenario: Pace band moves
- **WHEN** a minute passes and the 5h window moves from on pace to ahead of pace
- **THEN** the tick redraws the bar and the pill tint changes

#### Scenario: Terminal also attached
- **WHEN** the session has the terminal and desktop surfaces and a countdown text changes
- **THEN** the tick redraws the bar

### Requirement: Usage button expands a usage block on Desktop
On the desktop surface the bar SHALL show a usage button after the usage pills wherever it shows pills, reading `Usage details`, or `⤢` where the bar is too narrow for the name. Pressing it SHALL expand a usage block above the pills, and pressing it again SHALL collapse the block. The block SHALL start collapsed each session, and sending a prompt SHALL collapse it. The pills SHALL stay non-interactive.

#### Scenario: Expand and collapse
- **WHEN** the person presses the usage button on Desktop, then presses it again
- **THEN** the usage block shows above the pills, then goes away

#### Scenario: Narrowest bar
- **WHEN** the desktop bar has 33 cells
- **THEN** the usage button reads `⤢` and the pills and button stay on one row

#### Scenario: Sending a prompt collapses it
- **WHEN** the block is expanded and the person sends a prompt
- **THEN** the block collapses

#### Scenario: Calm session
- **WHEN** the desktop surface draws the bar and no segment needs attention
- **THEN** the pills and the usage button show, and the block is collapsed

#### Scenario: Terminal unchanged
- **WHEN** the terminal surface draws the bar
- **THEN** it shows no usage button and no usage block

### Requirement: Usage block window rows
The usage block SHALL show one row for each usage window that has a reading, named as the app names them: `Session limit`, `Weekly · all models`, and `Weekly · <model>`. Each row SHALL show the percent used and one meter, with a pale shadow behind the fill reaching the share of the window already gone. The pills SHALL keep their own labels.

#### Scenario: Names
- **WHEN** the 5h, 7d and a Fable weekly window all have readings
- **THEN** the rows read `Session limit`, `Weekly · all models` and `Weekly · Fable`, and the pills still read `5h`, `7d` and `Fable`

#### Scenario: Shadow against fill
- **WHEN** a window is 25% used with 77% of its time gone
- **THEN** its meter fills 25% and its shadow reaches 77%, so the shadow shows past the fill

#### Scenario: Window without a reset time
- **WHEN** a window has a reading and no reset time
- **THEN** its row shows the percent and meter with no shadow and no dim line

### Requirement: Usage block pace line
Each window row with a reset time SHALL carry one dim line giving where usage stands against pace. Usage more than 15 points below the share of time gone reads `Room to use more`, within 15 points reads `On pace`, and more than 15 points above reads `Ahead of pace`, colored as the pill is. A line that is not ahead SHALL end with the reset: `resets in <time left>` when under a day is left, else `resets <weekday> <time>`.

#### Scenario: Room to use more
- **WHEN** the Session limit is 25% used with 1 hour left of its 5 hours
- **THEN** its line reads `Room to use more · resets in 1h` and its fill stays the Session limit's own blue

#### Scenario: On pace, a weekly window
- **WHEN** the Weekly · all models window is 78% used with 77% of its time gone and resets in 3 days on Tuesday at 17:30
- **THEN** its line reads `On pace · resets Tue 17:30`

#### Scenario: Ahead of pace
- **WHEN** the Session limit is 71% used with 30% of its time gone
- **THEN** its line starts `Ahead of pace` and its fill is the pill's red

### Requirement: Usage block cap time
A window row that is ahead of pace SHALL add when the cap would be hit at the current rate, as `hits the cap in about <time>`, in place of the reset. It SHALL NOT add it before a tenth of the window has gone, or while nothing is used.

#### Scenario: Cap time
- **WHEN** the Session limit is 71% used with 1h30m of its 5 hours gone
- **THEN** its line reads `Ahead of pace · hits the cap in about 37m`

#### Scenario: Too early
- **WHEN** a window is 25% used with 5% of its time gone
- **THEN** its line reads `Ahead of pace` and no cap time

### Requirement: Usage block context row
When the context has a reading, the usage block SHALL show a row named `Context` with the tokens, and a meter that runs to the ideal ceiling, not to the window. Its line SHALL name the ideal range and keep the window size as a fact: `Ideal under 150K · window 1M` while calm, `Past the ideal range · window 1M` from 150K, and `Past <ceiling>, quality drops · window 1M` from the ceiling. Its meter SHALL have no shadow.

#### Scenario: Calm
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** its row shows `120K` and `Ideal under 150K · window 1M`

#### Scenario: Past the ideal range
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** its line reads `Past the ideal range · window 1M` and its fill is amber, nearly three quarters of the meter

#### Scenario: A smaller window lowers the ceiling
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** its line reads `Past 160K, quality drops · window 200K` and its fill is the pill's red

### Requirement: Usage block layout
The usage block SHALL show its rows two to a line, each meter filling its cell's width without being stretched, with no tick and no legend. Where two rows would not fit a line, it SHALL show one compact row per line instead, the name, meter and value on one line and the dim line under it, so the block and the pills fit the band without scrolling.

#### Scenario: Rows in a grid
- **WHEN** the context and the 5h, 7d and a per-model window all have readings
- **THEN** the block shows two rows per line and every meter fills its cell's width

#### Scenario: Narrow block
- **WHEN** the desktop bar has 55 cells and the block is expanded
- **THEN** each row shows its name, meter and value on one line with its dim line under it, and the pills stay in view

#### Scenario: No reading yet
- **WHEN** the context has no reading and no window has a reading
- **THEN** the pills and the usage button do not show, so there is no block to expand

### Requirement: Usage block stays current without flicker
While expanded, the usage block SHALL redraw only when a reading changes or a minute moves a pace band or a countdown it draws. Expanding or collapsing it SHALL redraw the bar once, and the button and the block SHALL NOT make the bar flicker on send or on turn complete.

#### Scenario: Idle while expanded
- **WHEN** the block is expanded and no reading changes within a minute
- **THEN** the bar does not redraw

#### Scenario: Turn completes while expanded
- **WHEN** a turn completes with the block expanded
- **THEN** the pills, the button and the block do not flicker
