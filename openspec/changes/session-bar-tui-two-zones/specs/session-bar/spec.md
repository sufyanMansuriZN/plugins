## ADDED Requirements

### Requirement: Two zones in the terminal bar
The terminal bar SHALL draw two zones on its one row: identity on the left (directory, branch, subagent type, model, cache state) and gauges on the right (context, then each usage window), ending at the band's right edge, with the space between them blank. The zones SHALL be at least 3 cells apart. Identity sections SHALL be separated by a dimmed ` · `; gauges SHALL be separated by blank cells only.

#### Scenario: Wide terminal
- **WHEN** the band is 185 cells wide and the bar shows `plugins (main)`, `Opus 5.5 1M`, `cache 38m`, the context and the 5h, 7d and Fable windows
- **THEN** the row starts `plugins (main) · Opus 5.5 1M · cache 38m`, the Fable gauge's last cell is the band's last cell, and only blank cells lie between `cache 38m` and the context gauge

#### Scenario: No separator between gauges
- **WHEN** the context and 5h gauges are both calm
- **THEN** no ` · ` sits between them

#### Scenario: Only usage windows
- **WHEN** no context reading has arrived and the 5h, 7d and Fable windows show
- **THEN** the right zone starts with the 5h gauge and still ends at the band's right edge

### Requirement: Gauges hold their columns
In the terminal bar a gauge's value SHALL take a fixed 4-cell slot, right-aligned, and its countdown, where one is drawn, a fixed 5-cell slot, left-aligned. A calm gauge SHALL take the same cells its pill would, its padding left blank. So a gauge SHALL keep its columns when its value or countdown changes length or it turns into a pill, as long as no gauge appears, disappears or changes tier.

#### Scenario: Value grows
- **WHEN** the context grows from 87,000 to 187,000 tokens and turns orange
- **THEN** the 5h, 7d and Fable gauges start in the same columns as before

#### Scenario: Short countdown
- **WHEN** the 5h window resets in 40 minutes
- **THEN** its countdown reads `40m` followed by two blank cells

#### Scenario: Short value
- **WHEN** the 7d window reads 9% used
- **THEN** its value reads two blank cells then `9%`

### Requirement: Secondary text in the terminal bar
Text the terminal bar draws dimmed (labels, branch, model, subagent type, separators, countdowns, the remaining part of a bar outside a pill, and the calm cache section) SHALL use one fixed mid grey, `#777777`, rather than the terminal's faint attribute, so it keeps about 4.5:1 contrast on a white background and about 3.7:1 on a near-black one. Each gauge's value SHALL be bold.

#### Scenario: Light theme
- **WHEN** the terminal background is white and the 5h window is calm at 48% with 2h10m left
- **THEN** `5h`, the bar's remaining part and `2h10m` are drawn in `#777777`, and `48%` is bold in the terminal's own text color

#### Scenario: No faint attribute
- **WHEN** the bar is drawn in any state
- **THEN** no run in it uses the faint (dim) attribute

## MODIFIED Requirements

### Requirement: Calm segments are plain text, attention becomes a pill
The bar SHALL draw each calm segment (directory, model, context, each usage window) as plain text with no background: values and the used part of a bar in the terminal's own text color, and labels in the secondary grey. A segment that needs attention SHALL become a square pill, one cell of padding each side, filled orange or vermillion, with dark text, so it reads on light and dark terminals alike. Inside a pill the remaining part of a bar SHALL be a darker shade of the pill's fill.

#### Scenario: Calm session
- **WHEN** no segment needs attention
- **THEN** no segment carries a background, and no value or used bar part carries an explicit text color

#### Scenario: One window needs attention
- **WHEN** only the 5h window is ahead of pace
- **THEN** only the 5h segment is a pill, and every run inside it sits on the pill's fill

#### Scenario: Bar inside a pill
- **WHEN** the 5h window is an orange pill at 62%
- **THEN** its used part is in the pill's dark text color and its remaining part in a darker shade of orange

### Requirement: Width adaptation
The bar SHALL fit on one row of the band's width, and SHALL never wrap. The space between the two zones SHALL shrink to its 3-cell minimum before any part is dropped. Bars SHALL be 5 cells (one per 20%) at every width. When the full bar does not fit, it SHALL drop the 7d and per-model weekly countdowns first, then drop the bars, then drop the 5h countdown and the cache section, keeping a `cache cold` pill for a cold cache.

#### Scenario: Wide terminal
- **WHEN** the full bar fits the band's width
- **THEN** 5-cell bars and every countdown show

#### Scenario: Gap closes first
- **WHEN** the full bar fits only with 3 cells between the zones
- **THEN** bars and every countdown still show

#### Scenario: Medium terminal
- **WHEN** the full bar is too wide but fits without the weekly countdowns
- **THEN** bars and the 5h countdown show, and the 7d and per-model weekly countdowns do not

#### Scenario: Narrower terminal
- **WHEN** the form without the weekly countdowns is too wide
- **THEN** the bars drop whole, with no shorter form between

#### Scenario: Narrow terminal
- **WHEN** nothing with bars fits, but the form without bars does
- **THEN** the left zone reads `plugins (main) · Opus 5.5` and the right zone `ctx 120K`, `5h 23% 2h40m` and `7d 61%`, with attention pills where needed

#### Scenario: Narrowest terminal
- **WHEN** even the form without bars is too wide
- **THEN** the right zone reads `ctx 120K`, `5h 23%` and `7d 61%`

#### Scenario: Narrowest terminal with a warm cache
- **WHEN** even the form without bars is too wide and the cache state is warm or has under 5 minutes left
- **THEN** no cache section shows

#### Scenario: Narrowest terminal with a cold cache
- **WHEN** even the form without bars is too wide and the cache state is cold
- **THEN** a vermillion `cache cold` pill, with no token count, ends the left zone, after the model

#### Scenario: Narrower than the narrowest form
- **WHEN** even the narrowest form is too wide, e.g. a long worktree dir and branch
- **THEN** the bar stays one row: the right zone shows whole and the left zone is cut short, ending in `…`

### Requirement: Cache state in the terminal bar
The terminal bar SHALL show the cache state as the last section of the left zone, right after the model: `cache in use` dimmed while a request streams, `cache 38m` dimmed while warm, an orange attention pill `cache 4m` with under 5 minutes left, and a vermillion attention pill `cache cold · re-reads 412K` once cold, or `cache cold` without a context reading. The time left SHALL use the reset countdown's format. A dimmed cache section SHALL follow the model after a dimmed ` · `; a cache pill SHALL follow it after one blank cell.

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left, the model is Opus 5.5 and the context holds 412,000 tokens
- **THEN** the left zone ends `Opus 5.5`, a dimmed ` · `, a dimmed `cache 38m`, and the right zone starts with `ctx`, its bar and `412K`

#### Scenario: In use
- **WHEN** a main request streams and the cache state is in flight
- **THEN** the cache section reads a dimmed `cache in use`

#### Scenario: Under 5 minutes
- **WHEN** the cache state has 4 minutes left
- **THEN** the cache section is an orange pill reading `cache 4m`, one blank cell after the model

#### Scenario: Cold
- **WHEN** the cache state is cold and the context holds 412,000 tokens
- **THEN** the cache section is a vermillion pill reading `cache cold · re-reads 412K`

#### Scenario: Cold without a context reading
- **WHEN** the cache state is cold and no context reading has arrived
- **THEN** the cache section is a vermillion pill reading `cache cold`

#### Scenario: Sections separated
- **WHEN** the bar shows the model, the context and the 5h window, and no cache state
- **THEN** the left zone ends with the model, and no ` · ` sits between the context and `5h`
