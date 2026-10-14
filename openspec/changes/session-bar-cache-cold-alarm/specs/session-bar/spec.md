## ADDED Requirements

### Requirement: Cache state for a session opened again
When a process starts on a session whose transcript already holds a main-loop response, the cache state SHALL be counted from the newest main-loop response's time, with the TTL of the newest one that wrote cache tokens, as if this process had sent it, before any request of this process. A transcript with no main-loop response, or one that cannot be read, SHALL leave the state hidden until the first main request.

#### Scenario: Resumed overnight
- **WHEN** a session is resumed whose newest main-loop response was written 9 hours ago with a 1-hour TTL
- **THEN** the cache state is cold before any message is sent

#### Scenario: Resumed within the TTL
- **WHEN** a session is reopened whose newest main-loop response was written 20 minutes ago with a 1-hour TTL
- **THEN** the cache state is warm with 40 minutes left

#### Scenario: Newest response wrote nothing
- **WHEN** the newest main-loop response, written 10 minutes ago, wrote no cache tokens and an older one wrote only 1-hour tokens
- **THEN** the TTL is 1 hour and the cache state is warm with 50 minutes left

#### Scenario: Subagent lines
- **WHEN** the newest response in the session's records is a subagent's, and the newest main-loop response was written 2 hours ago with a 1-hour TTL
- **THEN** the cache state is cold

#### Scenario: Synthetic line from a resume
- **WHEN** the newest response is a synthetic one the resume wrote a minute ago, and the newest main-loop response before it was written 2 hours ago with a 1-hour TTL
- **THEN** the cache state is cold

#### Scenario: Fresh session
- **WHEN** a new session starts with no response in its transcript
- **THEN** no cache state is shown

### Requirement: Context reading for a session opened again
When a process starts on a session and no context reading has arrived, the context reading SHALL be the engine's token count, or else the newest main-loop response's whole input from the transcript, against the engine's window, so a reopened session shows its context and the re-read it costs before its next response.

#### Scenario: Desktop reopens a session
- **WHEN** Desktop reopens a session whose newest main-loop response was answered over 412,000 input tokens of a 1,000,000-token window, and the engine has no count yet
- **THEN** the context pill shows `412K`, and a cold cache pill's alternative text is `Cache cold, the next message re-reads 412K`

#### Scenario: A measure came first
- **WHEN** a context reading arrived before the session's transcript was read
- **THEN** that reading stands

### Requirement: Desktop cache pill
On the desktop surface the cache SHALL have a pill of its own, right after the context pill, shown only with under 5 minutes left or cold: amber with an hourglass and `4m`, or red with the snowflake and `cold`. It SHALL keep its icon at every bar width, and SHALL NOT be shown in flight, warm, or in a subagent's view. Its alternative text SHALL be the cache line's words.

#### Scenario: Cold
- **WHEN** the cache state is cold and the context holds 412,000 tokens
- **THEN** a red pill with the snowflake and `cold` follows the context pill, and its alternative text is `Cache cold, the next message re-reads 412K`

#### Scenario: Under 5 minutes
- **WHEN** the cache state has 4 minutes left
- **THEN** an amber pill with an hourglass and `4m` follows the context pill

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left
- **THEN** no cache pill shows, and the context pill carries its flame

#### Scenario: Narrowest bar
- **WHEN** the desktop bar has 33 cells and the cache state is cold
- **THEN** every other pill shows its value only, and the cache pill keeps its snowflake

#### Scenario: Cold without a context reading
- **WHEN** a session is reopened cold and no context reading has arrived
- **THEN** the cache pill shows with the snowflake and `cold`, and its alternative text is `Cache cold`

## MODIFIED Requirements

### Requirement: Cache state
The bar SHALL carry a cache state at any context size: in flight while a main-loop model request streams, then warm, warm with under 5 minutes left, or cold, counted from the moment the last main-loop request was sent and its TTL. A wait between two requests of one turn SHALL count down like idle time. The state SHALL be hidden before the first main request and in a subagent's view, and SHALL show without a context reading. While the TTL is unknown, the state SHALL show in flight while a request streams and be hidden otherwise.

#### Scenario: First request of a session
- **WHEN** a session's first main request streams and no TTL has been read
- **THEN** the cache state is in flight

#### Scenario: Warm after a turn
- **WHEN** the turn's last main request was sent 22 minutes ago with a 1-hour TTL and the context holds 412,000 tokens
- **THEN** the cache state is warm with 38 minutes left

#### Scenario: Turn ends
- **WHEN** the response of a turn's last main request ends
- **THEN** the cache state is warm with the whole TTL left, less the response's own length

#### Scenario: Under 5 minutes left
- **WHEN** the last main request was sent 56 minutes ago with a 1-hour TTL and the context holds 412,000 tokens
- **THEN** the cache state is warm with under 5 minutes left

#### Scenario: Cold
- **WHEN** the last main request was sent 61 minutes ago with a 1-hour TTL
- **THEN** the cache state is cold, and stays cold until the next main request is sent

#### Scenario: Small context
- **WHEN** a request was sent 22 minutes ago with a 1-hour TTL and the context holds 45,000 tokens
- **THEN** the cache state is warm with 38 minutes left

#### Scenario: No context reading
- **WHEN** the last main request was sent 2 hours ago with a 1-hour TTL and no context reading has arrived
- **THEN** the cache state is cold and shown, with no token count

#### Scenario: Turn running
- **WHEN** a main-loop model request has been sent and its response has not ended
- **THEN** the cache state is in flight, with no time left shown

#### Scenario: Long wait inside a turn
- **WHEN** the turn's last request ended 7 minutes ago with a 5-minute TTL and a tool of that turn is still running
- **THEN** the cache state is cold

#### Scenario: Permission dialog left open
- **WHEN** the turn's last request ended 20 minutes ago with a 1-hour TTL and a permission dialog of that turn is open
- **THEN** the cache state is warm with 40 minutes left

#### Scenario: Slash command sends no request
- **WHEN** a local slash command runs after a request that was sent 10 minutes ago with a 1-hour TTL
- **THEN** the cache state is warm with 50 minutes left, and never in flight

#### Scenario: Subagent turn
- **WHEN** a subagent's request is sent while the main loop's last request was sent 10 minutes ago
- **THEN** the cache state keeps counting from the main loop's request

### Requirement: Cache TTL from the transcript
After each main-loop request ends, the TTL SHALL be read from the newest transcript response whose cache-read and uncached input counts equal that request's, searched over the whole transcript of the session now running: 1 hour when it wrote only 1-hour cache tokens, else 5 minutes when it wrote any 5-minute ones. While the TTL is unknown at a turn's end, it SHALL be read again 1 and 5 seconds later, and then each minute while it stays unknown and no request streams. A response that wrote nothing, no matching response, or a transcript that cannot be read SHALL keep the TTL last read; before any TTL was read, the TTL SHALL be unknown.

#### Scenario: One-hour writes only
- **WHEN** the matching response records 1,457 tokens written with a 1-hour TTL and 0 with a 5-minute TTL
- **THEN** the TTL is 1 hour

#### Scenario: Mixed writes
- **WHEN** the matching response records tokens written with both TTLs
- **THEN** the TTL is 5 minutes

#### Scenario: Field order does not matter
- **WHEN** the matching response lists the 5-minute count before the 1-hour count
- **THEN** the TTL is read the same as when the order is reversed

#### Scenario: Large lines after the response
- **WHEN** a 200 KB prompt snapshot line follows the matching response
- **THEN** the TTL is read from the response

#### Scenario: Line written after the turn ends
- **WHEN** the matching response is not in the transcript at the turn's end and lands within the next second, with no TTL read before
- **THEN** the TTL is read 1 second after the turn's end and the cache state shows

#### Scenario: Line written later still
- **WHEN** the matching response lands more than 5 seconds after the turn's end, with no TTL read before
- **THEN** the TTL is read on the next minute tick and the cache state shows

#### Scenario: Last response wrote nothing
- **WHEN** the matching response wrote no cache tokens and the TTL read before was 1 hour
- **THEN** the TTL stays 1 hour

#### Scenario: Transcript not yet written
- **WHEN** the newest transcript response's counts differ from the request's
- **THEN** the TTL read before stands, and the state is not hidden

#### Scenario: Unreadable transcript
- **WHEN** the transcript file is missing and no TTL was read before
- **THEN** the TTL is unknown and no cache state is shown

#### Scenario: Session changed in the same process
- **WHEN** `/clear` or `/resume` moves the process to another session and that session's first request ends with a 1-hour TTL
- **THEN** the TTL is read from the new session's transcript, and the cache state shows warm

### Requirement: Width adaptation
The bar SHALL fit on one row of the band's width when it can. When the full bar does not fit, it SHALL drop the 7d and per-model weekly countdowns first, then shorten the bars to 5 cells (one per 20%), then drop the bars, then drop the 5h countdown and the cache section, keeping a `cache cold` pill for a cold cache.

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
- **WHEN** even the form without bars is too wide and the cache state is warm or has under 5 minutes left
- **THEN** no cache section shows

#### Scenario: Narrowest terminal with a cold cache
- **WHEN** even the form without bars is too wide and the cache state is cold
- **THEN** a vermillion `cache cold` pill, with no token count, follows the model, before the context segment

### Requirement: Cache state in the terminal bar
The terminal bar SHALL show the cache state as a section of its own right after the model and before the context segment: `cache in use` dimmed while a request streams, `cache 38m` dimmed while warm, an orange attention pill `cache 4m` with under 5 minutes left, and a vermillion attention pill `cache cold · re-reads 412K` once cold, or `cache cold` without a context reading. The time left SHALL use the reset countdown's format. Every section of the bar SHALL be separated from the next by a dimmed ` · `.

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left, the model is Opus 5.5 and the context holds 412,000 tokens
- **THEN** the bar reads `Opus 5.5`, a dimmed ` · `, a dimmed `cache 38m`, a dimmed ` · `, then `ctx`, its bar and `412K`

#### Scenario: In use
- **WHEN** a main request streams and the cache state is in flight
- **THEN** the cache section reads a dimmed `cache in use`

#### Scenario: Under 5 minutes
- **WHEN** the cache state has 4 minutes left
- **THEN** the cache section is an orange pill reading `cache 4m`

#### Scenario: Cold
- **WHEN** the cache state is cold and the context holds 412,000 tokens
- **THEN** the cache section is a vermillion pill reading `cache cold · re-reads 412K`

#### Scenario: Cold without a context reading
- **WHEN** the cache state is cold and no context reading has arrived
- **THEN** the cache section is a vermillion pill reading `cache cold`

#### Scenario: Sections separated
- **WHEN** the bar shows the model, the context and the 5h window, and no cache state
- **THEN** a dimmed ` · ` sits between the model and `ctx`, and between the context and `5h`

### Requirement: Cache state on the Desktop context pill
The Desktop context pill SHALL show a flame glyph after its token count while the cache state is in flight or warm, and no cache glyph otherwise, as the cache pill then shows the state. A request SHALL NOT change the pill's width. The glyph SHALL use the theme's text color, and the pill SHALL show no cache countdown. The pill's alternative text SHALL name the state and the time left: `Context: 187K of 1M tokens · cache cold in 38m`. The context scale is explained in the usage block only.

#### Scenario: Warm pill
- **WHEN** the cache state is warm with 38 minutes left and the context holds 187,000 tokens of a 1,000,000-token window
- **THEN** the context pill shows `187K` and a flame, no `38m`, and its alternative text is `Context: 187K of 1M tokens · cache cold in 38m`

#### Scenario: Pill while a turn runs
- **WHEN** a main request streams while the cache state was warm
- **THEN** the pill keeps its flame and width, and its alternative text ends `cache in use`

#### Scenario: Cold pill
- **WHEN** the cache state is cold
- **THEN** the context pill shows no cache glyph, and the cache pill follows it

#### Scenario: No state
- **WHEN** no cache state is shown and the context holds 120,000 tokens of a 200,000-token window
- **THEN** the context pill is drawn with no glyph and no added width, and its alternative text is `Context: 120K of 200K tokens`

### Requirement: Cache line in the usage block
While a cache state is shown, the usage block's context row SHALL add a dim line after its two context lines: `Cache in use` while a request streams, `Cache cold in 38m` while warm, and `Cache cold, the next message re-reads 412K` once cold. The line SHALL start with the cache glyph for that state, the one the context pill or the cache pill shows, drawn as the row icons are.

#### Scenario: Warm line
- **WHEN** the usage block is open and the cache state is warm with 38 minutes left
- **THEN** the context row shows a flame and `Cache cold in 38m` under its scale line

#### Scenario: Cold line
- **WHEN** the usage block is open, the cache state is cold and the context holds 412,000 tokens
- **THEN** the context row shows a snowflake and `Cache cold, the next message re-reads 412K`

#### Scenario: Other lines
- **WHEN** the usage block is open
- **THEN** the pace lines and the two context lines show no icon

### Requirement: Desktop redraws only on a visible change
When Desktop is the only surface on the session, the minute tick SHALL redraw the bar only when a pill's pace band moved or the cache state changed between warm, under 5 minutes and cold, because no countdown is drawn on a Desktop pill other than the cache pill's. When the terminal surface is also on the session, the usage block is open, or the cache pill shows its minutes, the tick SHALL also redraw for a countdown change, the cache's included.

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

#### Scenario: Cache pill counts down
- **WHEN** Desktop is the only surface and the cache time left drops from 4 to 3 minutes
- **THEN** the tick redraws the bar and the cache pill reads `3m`

#### Scenario: Cache goes cold on Desktop
- **WHEN** Desktop is the only surface and the cache state moves from under 5 minutes to cold
- **THEN** the tick redraws the bar and the cache pill turns red with the snowflake
