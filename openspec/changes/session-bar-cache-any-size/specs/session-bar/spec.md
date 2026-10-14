# Spec Delta

## MODIFIED Requirements

### Requirement: Cache state
The bar SHALL carry a cache state at any context size: in flight while a main-loop model request streams, then warm, warm with under 5 minutes left, or cold, counted from the moment the last main-loop request was sent and its TTL. A wait between two requests of one turn SHALL count down like idle time. The state SHALL be hidden before the first main request, without a context reading, and in a subagent's view. While the TTL is unknown, the state SHALL show in flight while a request streams and be hidden otherwise.

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
- **WHEN** a request was sent and its TTL is known but no context reading has arrived
- **THEN** no cache state is shown

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
- **THEN** a dimmed `cache cold` section follows the context segment

### Requirement: Cache TTL from the transcript
After each main-loop request ends, the TTL SHALL be read from the newest transcript response whose cache-read and uncached input counts equal that request's, searched over the whole transcript: 1 hour when it wrote only 1-hour cache tokens, else 5 minutes when it wrote any 5-minute ones. While the TTL is unknown at a turn's end, it SHALL be read again 1 and 5 seconds later, and then each minute while it stays unknown and no request streams. A response that wrote nothing, no matching response, or a transcript that cannot be read SHALL keep the TTL last read; before any TTL was read, the TTL SHALL be unknown.

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

### Requirement: Cache state in the terminal bar
The terminal bar SHALL show the cache state as a section of its own after the context segment, in words: `cache in use` dimmed while a request streams, `cache 38m` dimmed while warm, `cache 4m` in orange with under 5 minutes left, and `cache cold` dimmed once cold. The time left SHALL use the reset countdown's format. Every section of the bar SHALL be separated from the next by a dimmed ` · `.

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left and the context holds 412,000 tokens
- **THEN** the bar reads `ctx`, its bar, `412K`, a dimmed ` · `, then a dimmed `cache 38m`

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
- **WHEN** the bar shows the model, the context and the 5h window
- **THEN** a dimmed ` · ` sits between the model and `ctx`, and between the context and `5h`
