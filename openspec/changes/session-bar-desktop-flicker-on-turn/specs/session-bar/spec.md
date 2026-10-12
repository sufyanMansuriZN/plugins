# Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Desktop pill hover
**Reason**: An interactive pill is rebuilt by Desktop on every redraw, which flickered the bar when a prompt was sent and when a turn completed. With hover on all pills it flickered; with hover on the 5h pill alone, that pill still flickered; with none, the bar was steady.
**Migration**: None. The value, the label and the severity colour are on each pill, and the countdown stays in the terminal bar. A reachable Desktop countdown is left for a later change.

## ADDED Requirements

### Requirement: Desktop pills are not interactive
On the desktop surface no pill SHALL be an interactive element, so that the bar stays steady when a prompt is sent and when a turn completes. A pill SHALL still carry its segment text as alternative text.

#### Scenario: No pill responds to hover
- **WHEN** the pointer is over any pill
- **THEN** no hover text shows

#### Scenario: Steady on send and turn complete
- **WHEN** a prompt is sent, and when a turn completes
- **THEN** the pills do not flicker
