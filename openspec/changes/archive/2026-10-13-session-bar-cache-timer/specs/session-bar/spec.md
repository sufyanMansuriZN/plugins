# Spec Delta

## ADDED Requirements

### Requirement: Cache state
Once a main-loop turn has completed, the context segment SHALL carry a cache state while the context holds 100K tokens or more: in use while a turn runs, then warm, warm with under 5 minutes left, or cold, counted from the turn's end and the TTL. It SHALL be hidden before the first turn, below 100K tokens, in a subagent's view, and when the TTL is unknown.

#### Scenario: Warm after a turn
- **WHEN** a turn ended 22 minutes ago with a 1-hour TTL and the context holds 412,000 tokens
- **THEN** the cache state is warm with 38 minutes left

#### Scenario: Under 5 minutes left
- **WHEN** a turn ended 56 minutes ago with a 1-hour TTL and the context holds 412,000 tokens
- **THEN** the cache state is warm with under 5 minutes left

#### Scenario: Cold
- **WHEN** a turn ended 61 minutes ago with a 1-hour TTL
- **THEN** the cache state is cold, and stays cold until the next prompt is sent

#### Scenario: Small context
- **WHEN** a turn ended and the context holds 45,000 tokens
- **THEN** no cache state is shown

#### Scenario: Turn running
- **WHEN** a prompt has been sent and its turn has not completed, however long it runs
- **THEN** the cache state is in use, with no time left shown

#### Scenario: Turn ends
- **WHEN** a turn completes while the cache state is in use
- **THEN** the cache state is warm with the whole TTL left

#### Scenario: Subagent turn
- **WHEN** a subagent's turn completes while the main turn runs
- **THEN** the cache state stays in use

### Requirement: Cache TTL from the transcript
The TTL SHALL come from the last response in the session's transcript that wrote cache tokens: 1 hour when it wrote some with a 1-hour TTL and none with a 5-minute TTL, else 5 minutes. When the transcript cannot be read, or no response in its tail records a cache write, the TTL SHALL be unknown.

#### Scenario: One-hour writes only
- **WHEN** the last response records 1,457 tokens written with a 1-hour TTL and 0 with a 5-minute TTL
- **THEN** the TTL is 1 hour

#### Scenario: Mixed writes
- **WHEN** the last response records tokens written with both TTLs
- **THEN** the TTL is 5 minutes

#### Scenario: Field order does not matter
- **WHEN** the last response lists the 5-minute count before the 1-hour count
- **THEN** the TTL is read the same as when the order is reversed

#### Scenario: Last response wrote nothing
- **WHEN** the last response wrote no cache tokens and the one before wrote only 1-hour ones
- **THEN** the TTL is 1 hour

#### Scenario: Unreadable transcript
- **WHEN** the transcript file is missing or no response in its tail records a cache write
- **THEN** the TTL is unknown and no cache state is shown

### Requirement: Cache state in the terminal bar
The terminal context segment SHALL show the cache state after its token count: `❄ in use` dimmed while a turn runs, `❄ 38m` dimmed while warm, `❄ 4m` in orange with under 5 minutes left, and `❄ cold` dimmed once cold. The time left SHALL use the reset countdown's format.

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left and the context holds 412,000 tokens
- **THEN** the context segment reads `ctx`, its bar, `412K`, then a dimmed `❄ 38m`

#### Scenario: In use
- **WHEN** a turn runs and the cache state is in use
- **THEN** the context segment ends with a dimmed `❄ in use`

#### Scenario: Under 5 minutes
- **WHEN** the cache state has 4 minutes left
- **THEN** `❄ 4m` is drawn in orange

#### Scenario: Cold
- **WHEN** the cache state is cold
- **THEN** the context segment ends with a dimmed `❄ cold`

### Requirement: Cache state on the Desktop context pill
The Desktop context pill SHALL show one glyph for the cache state after its token count: a flame while in use or warm, an hourglass with under 5 minutes left, a snowflake once cold. Sending a prompt SHALL NOT change the pill's width. The glyph SHALL use the theme's text color, and the pill SHALL show no cache countdown. The pill's alternative text SHALL name the state and the time left.

#### Scenario: Warm pill
- **WHEN** the cache state is warm with 38 minutes left
- **THEN** the context pill shows its token count and a flame, no `38m`, and its alternative text names `cache cold in 38m`

#### Scenario: Pill while a turn runs
- **WHEN** a prompt is sent while the cache state is warm
- **THEN** the pill keeps its flame and width, and its alternative text names `cache in use`

#### Scenario: Cold pill
- **WHEN** the cache state is cold
- **THEN** the context pill shows a snowflake in the theme's text color

#### Scenario: No state
- **WHEN** no cache state is shown
- **THEN** the context pill is drawn as before, with no glyph and no added width

### Requirement: Cache line in the usage block
While a cache state is shown, the usage block's context row SHALL add a second dim line: `Cache in use` while a turn runs, `Cache cold in 38m` while warm, and `Cache cold, the next message re-reads 412K` once cold.

#### Scenario: Warm line
- **WHEN** the usage block is open and the cache state is warm with 38 minutes left
- **THEN** the context row shows `Cache cold in 38m` under its existing line

#### Scenario: Cold line
- **WHEN** the usage block is open, the cache state is cold and the context holds 412,000 tokens
- **THEN** the context row shows `Cache cold, the next message re-reads 412K`

## MODIFIED Requirements

### Requirement: Desktop pills are not interactive
On the desktop surface no pill SHALL be an interactive element, so that the bar stays steady when a prompt is sent and when a turn completes. A pill SHALL still carry its segment text as alternative text. While the pointer is over a pill, the surface SHALL show that pill's segment text in a card by the pill, without a redraw of the bar, and SHALL hide it when the pointer leaves.

#### Scenario: Hover shows the segment text
- **WHEN** the pointer is over the context pill and the cache state is warm with 38 minutes left
- **THEN** a card by the pill shows the context's tokens, its window and `cache cold in 38m`

#### Scenario: Pointer leaves
- **WHEN** the pointer leaves the pill
- **THEN** the card is hidden

#### Scenario: No pill responds to hover
- **WHEN** the pointer moves over and off any pill
- **THEN** no pill is an interactive element, and the bar is not redrawn

#### Scenario: Steady on send and turn complete
- **WHEN** a prompt is sent, and when a turn completes
- **THEN** the pills do not flicker

### Requirement: Width adaptation
The bar SHALL fit on one row of the band's width when it can. When the full bar does not fit, it SHALL drop the 7d and per-model weekly countdowns first, then shorten the bars to 5 cells (one per 20%), then drop the bars, then drop the 5h countdown and the cache countdown, keeping `❄` alone for a warm cache and `❄ cold` for a cold one.

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

#### Scenario: Narrowest terminal with a warm cache
- **WHEN** even the form without bars is too wide and the cache state is warm
- **THEN** the context segment reads `ctx 412K ❄` with no countdown

### Requirement: Desktop redraws only on a visible change
When Desktop is the only surface on the session, the minute tick SHALL redraw the bar only when a pill's pace band moved or the cache state changed between warm, under 5 minutes and cold, because no countdown is drawn on a Desktop pill. When the terminal surface is also on the session, or the usage block is open, the tick SHALL also redraw for a countdown change, the cache's included.

#### Scenario: A quiet minute on Desktop
- **WHEN** a minute passes, the 5h countdown drops from `4h13m` to `4h12m`, and no pace band moved
- **THEN** the tick does not redraw the bar

#### Scenario: Pace band moves
- **WHEN** a minute passes and the 5h window moves from on pace to ahead of pace
- **THEN** the tick redraws the bar and the pill tint changes

#### Scenario: Terminal also attached
- **WHEN** the session has the terminal and desktop surfaces and a countdown text changes
- **THEN** the tick redraws the bar

#### Scenario: Cache time drops on Desktop
- **WHEN** Desktop is the only surface, the usage block is collapsed, and the cache time left drops from 38 to 37 minutes
- **THEN** the tick does not redraw the bar

#### Scenario: Cache goes cold on Desktop
- **WHEN** Desktop is the only surface and the cache state moves from under 5 minutes to cold
- **THEN** the tick redraws the bar and the pill's glyph becomes a snowflake
