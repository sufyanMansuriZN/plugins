# Spec Delta

## MODIFIED Requirements

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

### Requirement: Context size
The context segment SHALL show the context's input tokens (e.g. `187K`), labelled `ctx`. It SHALL turn orange from 150K tokens, and vermillion from the lower of 250K tokens and 80% of the window. It SHALL be hidden until the session has a reading.

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

## ADDED Requirements

### Requirement: Context bar
The context segment SHALL show a bar before its token count that runs from 0 to its vermillion threshold, so a full bar means vermillion. It SHALL use the usage bars' glyphs, cell counts and half-cell steps, clamped at full. The cell holding the orange threshold SHALL be a `┿` tick, drawn like the used part once the fill reaches that cell and dimmed like the rest before that.

#### Scenario: Below the warn tick
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━─┿───`

#### Scenario: Past the warn tick
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━━┿╾──`

#### Scenario: Past the vermillion threshold
- **WHEN** the context holds 260,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━━━━━┿━━━`

#### Scenario: A 200K window shortens the scale
- **WHEN** the context holds 80,000 tokens of a 200,000-token window
- **THEN** its bar runs to 160,000 tokens and reads `━━━━━────┿`

#### Scenario: Short bars
- **WHEN** the bar is drawn at 5 cells with 120,000 tokens of a 1,000,000-token window
- **THEN** its bar reads `━━╾┿─`

### Requirement: Model label
The model segment SHALL show the model's name and version (e.g. `Opus 5.5`) followed by the context window size once the session has a context reading (e.g. `Opus 5.5 1M`). Before that, it SHALL show `1M` only when the model ID names the 1M window (`[1m]`).

#### Scenario: Window from the context reading
- **WHEN** the model ID is `claude-opus-5-5` and the context reports a 1,000,000-token window
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: A 200K window
- **WHEN** the model ID is `claude-haiku-4-5-20251001` and the context reports a 200,000-token window
- **THEN** the model segment shows `Haiku 4.5 200K`

#### Scenario: No reading yet
- **WHEN** no response has landed and the model ID is `claude-opus-5-5[1m]`
- **THEN** the model segment shows `Opus 5.5 1M`

## REMOVED Requirements

### Requirement: Cache hit-ratio pill
**Reason**: A low cache ratio comes from events that are expected (fresh start, compaction) or already past (a long idle, a model or tool switch) by the time it shows, so the segment gives nothing to act on and takes up room.
**Migration**: None. The segment and its reading are dropped. Prompt-cache behaviour is unchanged.
