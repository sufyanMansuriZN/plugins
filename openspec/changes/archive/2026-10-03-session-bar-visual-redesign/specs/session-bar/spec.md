# Spec Delta

## Purpose

The session bar is the band above the prompt that shows where the session is, which model it runs, how full the context is and how much of the account's usage windows are spent, using color only when something needs attention.

## ADDED Requirements

### Requirement: Calm segments are plain text, attention becomes a pill
The bar SHALL draw each calm segment (directory, model, context, each usage window, cache ratio) as plain text in the terminal's own colors, with labels dimmed. A segment that needs attention SHALL become a pill with rounded caps, filled orange or vermillion, with dark text, so it reads on light and dark terminals alike.

#### Scenario: Calm session
- **WHEN** no segment needs attention
- **THEN** no segment carries a background or an explicit text color

#### Scenario: One window needs attention
- **WHEN** only the 5h window is ahead of pace
- **THEN** only the 5h segment is a pill, and every run inside it sits on the pill's fill

### Requirement: Usage bars
The context, 5h, 7d and per-model weekly segments SHALL show a bar of 10 cells (one per 10%) at half-cell steps before their percentage: heavy `━` for the used part, light `─` for the rest, and `╾` for a half step between them. The parts SHALL differ in line weight, so the bar reads without relying on color.

#### Scenario: Partial fill
- **WHEN** the 5h window reads 23.4% used
- **THEN** its bar reads `━━╾───────` followed by `23%`

#### Scenario: Whole cells
- **WHEN** a window reads 20% used
- **THEN** its bar reads `━━────────`

### Requirement: Reset countdown
A usage window with a known reset time SHALL show the time left until it resets, as at most two units: `2h40m`, `1d7h`, `12m`.

#### Scenario: Hours and minutes
- **WHEN** the 5h window resets in 2 hours 40 minutes
- **THEN** the 5h segment shows `2h40m`

#### Scenario: Days and hours
- **WHEN** the 7d window resets in 1 day 7 hours 20 minutes
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
The context segment SHALL show the context's input tokens over the model's window as `<tokens>/<window>` (e.g. `187K/1M`), labelled `ctx`, with its bar showing the share of the window. It SHALL turn orange from 150K tokens, and vermillion from the lower of 250K tokens and 80% of the window. It SHALL be hidden until the session has a reading.

#### Scenario: Comfortable on a 1M window
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** the context segment shows `ctx`, a bar and `120K/1M`, as plain text

#### Scenario: Past the compaction point on a 1M window
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** the context segment shows `187K/1M` in an orange pill

#### Scenario: A 200K window caps the red threshold
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** the context segment shows `170K/200K` in a vermillion pill

#### Scenario: Fresh session
- **WHEN** no response has landed yet
- **THEN** no context segment is drawn

### Requirement: Cache hit-ratio pill
The bar SHALL show the share of the last response's input tokens served from the prompt cache as `cache <n>%`. It SHALL turn orange only when the last two readings are both below 50%, so a single expected miss (a fresh start, a compaction, a long idle gap) never colors it. It SHALL be hidden until a reading exists.

#### Scenario: Warm cache
- **WHEN** the last response read 98% of its input from the cache
- **THEN** the bar shows `cache 98%` as plain text

#### Scenario: Single miss after a break
- **WHEN** the previous reading was 97% and the last response read 4% from the cache
- **THEN** the cache segment shows `cache 4%` as plain text

#### Scenario: First response
- **WHEN** the session's first response read 0% from the cache
- **THEN** the cache segment shows `cache 0%` as plain text

#### Scenario: Repeated misses
- **WHEN** the last two responses read 12% and 9% from the cache
- **THEN** the cache segment shows `cache 9%` in an orange pill

### Requirement: Width adaptation
The bar SHALL fit on one row of the band's width when it can. When the full bar does not fit, it SHALL drop the countdowns first, then shorten the bars to 5 cells (one per 20%), then drop the bars.

#### Scenario: Wide terminal
- **WHEN** the full bar fits the band's width
- **THEN** 10-cell bars and countdowns all show

#### Scenario: Medium terminal
- **WHEN** the full bar is too wide but fits without countdowns
- **THEN** 10-cell bars show and countdowns do not

#### Scenario: Narrower terminal
- **WHEN** only the form with 5-cell bars fits
- **THEN** 5-cell bars show and countdowns do not

#### Scenario: Narrow terminal
- **WHEN** nothing with bars fits
- **THEN** the bar shows `dir · model   ctx n%   5h n%   7d n%` with attention pills where needed

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
