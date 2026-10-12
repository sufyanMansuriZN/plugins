# Spec Delta

## MODIFIED Requirements

### Requirement: Desktop pills
On the desktop surface each segment SHALL be a rounded pill holding a colored icon that identifies the segment, then its text. The pill background SHALL fill from the left edge to the share used. The context, the 5h window, the 7d window and a per-model weekly window SHALL each have a different icon and icon color. The context pill SHALL show only its token count, with no `ctx` label. A usage pill SHALL show a dim label then a bold percentage. No pill SHALL show a countdown. A segment needing attention SHALL be tinted orange or vermillion; a calm one SHALL be neutral.

#### Scenario: Context needing attention
- **WHEN** the context holds 213,000 tokens of a 1,000,000-token window
- **THEN** its pill is orange, shows `213K` with no `ctx` text, shows the context icon, and its fill reaches 85% of the pill, the share of the vermillion threshold

#### Scenario: Usage pills have no countdown
- **WHEN** the 5h window is 15% used with 4h13m left and the 7d window is 76% used
- **THEN** the 5h pill shows `5h 15%` and the 7d pill shows `7d 76%`, and neither shows `4h13m`

#### Scenario: Each segment has its own colored icon
- **WHEN** the desktop surface draws the context, 5h, 7d and a per-model weekly pill
- **THEN** the four pills show four different icons in four different colors

#### Scenario: Icon on a tinted pill
- **WHEN** a pill is tinted for attention
- **THEN** its icon is the darker shade of its own color, so it reads on the tint

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
- **THEN** that pill has a neutral background and a gray fill

### Requirement: Desktop pill hover
On the desktop surface each pill SHALL show on hover the segment's full name, its value, its time until reset where it has one, and for a usage window whether it is on pace. The countdown SHALL appear only here.

#### Scenario: Countdown on hover
- **WHEN** the user hovers the 5h pill with 4h13m left
- **THEN** the card reads `Session limit: 15% used · resets in 4h13m · on pace`

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
