# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
