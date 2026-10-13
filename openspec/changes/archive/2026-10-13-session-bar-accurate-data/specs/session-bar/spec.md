# Spec Delta

## MODIFIED Requirements

### Requirement: Cache state
The context segment SHALL carry a cache state while the context holds 100K tokens or more: in flight while a main-loop model request streams, then warm, warm with under 5 minutes left, or cold, counted from the moment the last main-loop request was sent and its TTL. A wait between two requests of one turn SHALL count down like idle time. The state SHALL be hidden before the first main request, below 100K tokens, in a subagent's view, and when the TTL is unknown.

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
- **WHEN** a request was sent and the context holds 45,000 tokens
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

### Requirement: Cache TTL from the transcript
After each main-loop request ends, the TTL SHALL be read from the newest transcript response whose cache-read and uncached input counts equal that request's: 1 hour when it wrote only 1-hour cache tokens, else 5 minutes when it wrote any 5-minute ones. A response that wrote nothing, no matching response, or a transcript that cannot be read SHALL keep the TTL last read; before any TTL was read, the TTL SHALL be unknown.

#### Scenario: One-hour writes only
- **WHEN** the matching response records 1,457 tokens written with a 1-hour TTL and 0 with a 5-minute TTL
- **THEN** the TTL is 1 hour

#### Scenario: Mixed writes
- **WHEN** the matching response records tokens written with both TTLs
- **THEN** the TTL is 5 minutes

#### Scenario: Field order does not matter
- **WHEN** the matching response lists the 5-minute count before the 1-hour count
- **THEN** the TTL is read the same as when the order is reversed

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
The terminal context segment SHALL show the cache state after its token count: `❄ in use` dimmed while a request streams, `❄ 38m` dimmed while warm, `❄ 4m` in orange with under 5 minutes left, and `❄ cold` dimmed once cold. The time left SHALL use the reset countdown's format.

#### Scenario: Warm
- **WHEN** the cache state is warm with 38 minutes left and the context holds 412,000 tokens
- **THEN** the context segment reads `ctx`, its bar, `412K`, then a dimmed `❄ 38m`

#### Scenario: In use
- **WHEN** a main request streams and the cache state is in flight
- **THEN** the context segment ends with a dimmed `❄ in use`

#### Scenario: Under 5 minutes
- **WHEN** the cache state has 4 minutes left
- **THEN** `❄ 4m` is drawn in orange

#### Scenario: Cold
- **WHEN** the cache state is cold
- **THEN** the context segment ends with a dimmed `❄ cold`

### Requirement: Cache state on the Desktop context pill
The Desktop context pill SHALL show one glyph for the cache state after its token count: a flame while in flight or warm, an hourglass with under 5 minutes left, a snowflake once cold. The snowflake SHALL have a branch on each of its six arms, so it reads as a snowflake and not an asterisk at pill size. A request SHALL NOT change the pill's width. The glyph SHALL use the theme's text color, and the pill SHALL show no cache countdown. The pill's alternative text SHALL name the state and the time left: `Context: 187K of 1M tokens · cache cold in 38m`. The context scale is explained in the usage block only.

#### Scenario: Warm pill
- **WHEN** the cache state is warm with 38 minutes left and the context holds 187,000 tokens of a 1,000,000-token window
- **THEN** the context pill shows `187K` and a flame, no `38m`, and its alternative text is `Context: 187K of 1M tokens · cache cold in 38m`

#### Scenario: Pill while a turn runs
- **WHEN** a main request streams while the cache state was warm
- **THEN** the pill keeps its flame and width, and its alternative text ends `cache in use`

#### Scenario: Cold pill
- **WHEN** the cache state is cold
- **THEN** the context pill shows a snowflake with a branch on each of its six arms, in the theme's text color

#### Scenario: No state
- **WHEN** no cache state is shown and the context holds 120,000 tokens of a 200,000-token window
- **THEN** the context pill is drawn with no glyph and no added width, and its alternative text is `Context: 120K of 200K tokens`

### Requirement: Cache line in the usage block
While a cache state is shown, the usage block's context row SHALL add a dim line after its two context lines: `Cache in use` while a request streams, `Cache cold in 38m` while warm, and `Cache cold, the next message re-reads 412K` once cold. The line SHALL start with the same cache glyph the context pill shows, drawn as the row icons are.

#### Scenario: Warm line
- **WHEN** the usage block is open and the cache state is warm with 38 minutes left
- **THEN** the context row shows a flame and `Cache cold in 38m` under its scale line

#### Scenario: Cold line
- **WHEN** the usage block is open, the cache state is cold and the context holds 412,000 tokens
- **THEN** the context row shows a snowflake and `Cache cold, the next message re-reads 412K`

#### Scenario: Other lines
- **WHEN** the usage block is open
- **THEN** the pace lines and the two context lines show no icon

### Requirement: Context size
The context segment SHALL show the context's input tokens (e.g. `187K`), labelled `ctx`. It SHALL turn orange from 150K tokens, and vermillion from the lower of 250K tokens and 80% of the auto-compact threshold once that is known, else 80% of the window. It SHALL be hidden until the session has a reading, hidden again from a compaction until the next reply, and hidden while a subagent's transcript is in view.

#### Scenario: Comfortable on a 1M window
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** the context segment shows `ctx`, a bar and `120K`, as plain text

#### Scenario: Past the compaction point on a 1M window
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** the context segment shows `187K` in an orange pill

#### Scenario: A 200K window caps the red threshold
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** the context segment shows `170K` in a vermillion pill

#### Scenario: A smaller auto-compact threshold caps the red threshold
- **WHEN** the context holds 170,000 tokens of a 1,000,000-token window whose auto-compact threshold is 200,000
- **THEN** the context segment shows `170K` in a vermillion pill

#### Scenario: Fresh session
- **WHEN** no response has landed yet
- **THEN** no context segment is drawn

#### Scenario: Just compacted
- **WHEN** the conversation was compacted and no reply has landed since
- **THEN** no context segment is drawn

#### Scenario: Subagent in view
- **WHEN** a subagent's transcript is in view and the main loop's context holds 187,400 tokens
- **THEN** no context segment is drawn

### Requirement: Usage block context row
When the context has a reading, the usage block SHALL show a row named `Context` with the tokens, and a meter that runs to the ideal ceiling, not to the window. Its line SHALL name the ideal range and keep the window size as a fact: `Ideal under 150K · window 1M` while calm, `Past the ideal range · window 1M` from 150K, and `Past <ceiling>, quality drops · window 1M` from the ceiling, the ceiling being the one the auto-compact threshold sets when known. Its meter SHALL have no shadow.

#### Scenario: Calm
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** its row shows `120K` and `Ideal under 150K · window 1M`

#### Scenario: Past the ideal range
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** its line reads `Past the ideal range · window 1M` and its fill is amber, nearly three quarters of the meter

#### Scenario: A smaller window lowers the ceiling
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** its line reads `Past 160K, quality drops · window 200K` and its fill is the pill's red

#### Scenario: A smaller auto-compact threshold lowers the ceiling
- **WHEN** the context holds 140,000 tokens of a 200,000-token window whose auto-compact threshold is 167,000
- **THEN** its line reads `Past 134K, quality drops · window 200K`, with nothing said about the threshold

### Requirement: Model label
The model segment SHALL show the model's name and version (e.g. `Opus 5.5`) followed by the context window size once the session has a context reading (e.g. `Opus 5.5 1M`). Before that, it SHALL show `1M` only when the model ID names the 1M window (`[1m]`). For a subagent in view, it SHALL name the model of that subagent's latest model request, with `1M` only when that model ID names it, and SHALL be left out until the subagent has made a request. When the model that answered the last main request differs from the configured one, the usage block SHALL add a row line `Answered by Sonnet 5.5`; the segment keeps the configured model.

#### Scenario: Window from the context reading
- **WHEN** the model ID is `claude-opus-5-5` and the context reports a 1,000,000-token window
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: A 200K window
- **WHEN** the model ID is `claude-haiku-4-5-20251001` and the context reports a 200,000-token window
- **THEN** the model segment shows `Haiku 4.5 200K`

#### Scenario: No reading yet
- **WHEN** no response has landed and the model ID is `claude-opus-5-5[1m]`
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: Subagent takes no window from main
- **WHEN** a subagent in view runs `claude-sonnet-5-5` and the main loop's context reports a 1,000,000-token window
- **THEN** the model segment shows `Sonnet 5.5`

#### Scenario: Subagent before its first request
- **WHEN** a `Plan` subagent's transcript is in view and it has made no model request yet
- **THEN** the bar starts `plugins · Plan` and names no model

#### Scenario: Fallback answered
- **WHEN** the configured model is `claude-opus-5-5` and the last main request was answered by `claude-sonnet-5-5`
- **THEN** the model segment shows `Opus 5.5 1M` and the usage block's context row adds `Answered by Sonnet 5.5`

### Requirement: Values survive gaps
The bar SHALL draw the last known usage readings, from this session or an earlier one, until a fresh reading arrives. While a surface is attached and the last successful usage fetch is over 5 minutes old, the bar SHALL fetch again within the next minute, so that other sessions' spend and a reset show without a turn. A reading whose window has reset SHALL be re-fetched, and not drawn until a fresh reading replaces it. A failed fetch SHALL NOT count as a fresh reading.

#### Scenario: Launch before any response
- **WHEN** a session starts and an earlier session stored 5h and 7d readings whose windows have not reset
- **THEN** the bar shows those readings before the first response

#### Scenario: Stale window
- **WHEN** a stored 5h reading's reset time has passed
- **THEN** the 5h segment is not drawn from it, and a fetch runs within the next minute

#### Scenario: Idle session, other sessions spend
- **WHEN** no turn runs for 12 minutes and another session raised the 5h window from 40% to 55%
- **THEN** the bar shows 55% within 7 minutes of the change

#### Scenario: Fetch fails
- **WHEN** a usage fetch fails
- **THEN** the last good readings stay, and the next tick past 5 minutes from the last success fetches again

#### Scenario: Same reading from two sources
- **WHEN** a response header reports 23.4% and the usage endpoint reports 23% for the same window
- **THEN** the bar does not redraw between them

## ADDED Requirements

### Requirement: Usage reading age
The usage block SHALL show when its usage readings were last fetched once that is over 10 minutes ago, as a dim line under the window rows: `Usage as of 14:20`, in the reset time's format.

#### Scenario: Fresh readings
- **WHEN** the usage block is open and the readings were fetched 3 minutes ago
- **THEN** no age line is shown

#### Scenario: Old readings
- **WHEN** the usage block is open, the readings were fetched at 14:20 today and it is now 14:35
- **THEN** a dim line reads `Usage as of 14:20`

#### Scenario: Readings from yesterday
- **WHEN** the readings were fetched on Tuesday at 17:30 and it is now Wednesday
- **THEN** the line reads `Usage as of Tue 17:30`

### Requirement: Cache state ends on a model change or compaction
The cache state SHALL turn cold the moment a main-loop request names a model other than the one the last request was answered by, and SHALL be hidden from a compaction of the main conversation until the next main request. A compaction that only precomputes, or that is skipped, SHALL change nothing.

#### Scenario: Model switched
- **WHEN** the last request was answered by `claude-opus-5-5` 3 minutes ago with a 1-hour TTL and the next main request names `claude-sonnet-5-5`
- **THEN** the cache state is cold until that request's response ends

#### Scenario: Compacted
- **WHEN** the main conversation is compacted
- **THEN** no cache state is shown until the next main request ends

#### Scenario: Precompute
- **WHEN** a compaction runs only to precompute, or is skipped
- **THEN** the cache state is unchanged

### Requirement: Accuracy log
With debug logging on, the bar SHALL write one line per main-loop request that pairs each predicted value with the measured one: the cache state predicted at send time with the request's cache-read tokens against the previous request's total input; the context tokens shown with the request's total input; the window percentages from the last header against the endpoint.

#### Scenario: Warm prediction confirmed
- **WHEN** the state predicted warm and the request read 411,900 of the previous request's 412,000 input tokens from cache
- **THEN** the line marks the cache prediction as confirmed

#### Scenario: Warm prediction wrong
- **WHEN** the state predicted warm and the request read 1,200 of the previous request's 412,000 input tokens from cache
- **THEN** the line marks the cache prediction as wrong
