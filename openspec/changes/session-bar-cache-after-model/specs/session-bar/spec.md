## MODIFIED Requirements

### Requirement: Width adaptation
The bar SHALL fit on one row of the band's width when it can. When the full bar does not fit, it SHALL drop the 7d and per-model weekly countdowns first, then shorten the bars to 5 cells (one per 20%), then drop the bars, then drop the 5h countdown and the cache section, keeping `cache cold` for a cold cache.

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
- **THEN** the bar shows `dir · model · ctx 120K · 5h 23% 2h40m · 7d 61%` with attention pills where needed

#### Scenario: Narrowest terminal
- **WHEN** even the form without bars is too wide
- **THEN** the bar shows `dir · model · ctx 120K · 5h 23% · 7d 61%`

#### Scenario: Narrowest terminal with a warm cache
- **WHEN** even the form without bars is too wide and the cache state is warm
- **THEN** no cache section shows

#### Scenario: Narrowest terminal with a cold cache
- **WHEN** even the form without bars is too wide and the cache state is cold
- **THEN** a dimmed `cache cold` section follows the model, before the context segment

### Requirement: Cache state in the terminal bar
The terminal bar SHALL show the cache state as a section of its own right after the model and before the context segment, in words: `cache in use` dimmed while a request streams, `cache 38m` dimmed while warm, `cache 4m` in orange with under 5 minutes left, and `cache cold` dimmed once cold. The time left SHALL use the reset countdown's format. Every section of the bar SHALL be separated from the next by a dimmed ` · `.

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left, the model is Opus 5.5 and the context holds 412,000 tokens
- **THEN** the bar reads `Opus 5.5`, a dimmed ` · `, a dimmed `cache 38m`, a dimmed ` · `, then `ctx`, its bar and `412K`

#### Scenario: In use
- **WHEN** a main request streams and the cache state is in flight
- **THEN** the cache section reads a dimmed `cache in use`

#### Scenario: Under 5 minutes
- **WHEN** the cache state has 4 minutes left
- **THEN** `cache 4m` is drawn in orange

#### Scenario: Cold
- **WHEN** the cache state is cold
- **THEN** the cache section reads a dimmed `cache cold`

#### Scenario: Sections separated
- **WHEN** the bar shows the model, the context and the 5h window, and no cache state
- **THEN** a dimmed ` · ` sits between the model and `ctx`, and between the context and `5h`
