## ADDED Requirements

### Requirement: Usage block row icons
Each usage block row SHALL show its pill's icon before its name, in the same shape, size and stroke width as on the pill. The icon SHALL use an accent blue, lighter on a dark theme, whatever the row's state, and the name SHALL keep its font, size and weight. The icons SHALL show at every block width; a name too wide for its column SHALL be cut, and its icon kept.

#### Scenario: Icons match the pills
- **WHEN** the usage block is open with the context, 5h, 7d and a Fable weekly window
- **THEN** the rows show the stack, clock, calendar and sparkles icons before `Context`, `Session limit`, `Weekly · all models` and `Weekly · Fable`, each the same shape, size and stroke as in its pill

#### Scenario: Icon color
- **WHEN** the Session limit row is ahead of pace and its meter is red
- **THEN** its icon stays the accent blue

#### Scenario: Narrow block
- **WHEN** the usage block shows one row per line and `Weekly · all models` does not fit its name column
- **THEN** the row shows the calendar icon and a cut name

### Requirement: Usage block card and meters
The open usage block SHALL draw as a card: the theme's inverse ground (white on a light theme), a round border, and padding inside it. Each meter SHALL be a plain gray track with no outline and its fill solid in the window's color, the share of time gone a darker gray behind the fill.

#### Scenario: Card
- **WHEN** the usage block is open
- **THEN** its rows sit inside a bordered card, apart from the band's own background

#### Scenario: Solid fill
- **WHEN** the Session limit is 25% used and calm
- **THEN** its meter fills a quarter in solid blue on a gray track

## MODIFIED Requirements

### Requirement: Usage block window rows
The usage block SHALL show one row for each usage window that has a reading, named as the app names them: `Session limit`, `Weekly · all models`, and `Weekly · <model>`. Each row SHALL show the percent used and one meter, with a darker gray shadow behind the fill reaching the share of the window already gone. The pills SHALL keep their own labels.

#### Scenario: Names
- **WHEN** the 5h, 7d and a Fable weekly window all have readings
- **THEN** the rows read `Session limit`, `Weekly · all models` and `Weekly · Fable`, and the pills still read `5h`, `7d` and `Fable`

#### Scenario: Shadow against fill
- **WHEN** a window is 25% used with 77% of its time gone
- **THEN** its meter fills 25% and its shadow reaches 77%, so the shadow shows past the fill

#### Scenario: Window without a reset time
- **WHEN** a window has a reading and no reset time
- **THEN** its row shows the percent and meter with no shadow and no dim line

### Requirement: Cache state on the Desktop context pill
The Desktop context pill SHALL show one glyph for the cache state after its token count: a flame while in use or warm, an hourglass with under 5 minutes left, a snowflake once cold. The snowflake SHALL have a branch on each of its six arms, so it reads as a snowflake and not an asterisk at pill size. Sending a prompt SHALL NOT change the pill's width. The glyph SHALL use the theme's text color, and the pill SHALL show no cache countdown. The pill's alternative text SHALL name the state and the time left.

#### Scenario: Warm pill
- **WHEN** the cache state is warm with 38 minutes left
- **THEN** the context pill shows its token count and a flame, no `38m`, and its alternative text names `cache cold in 38m`

#### Scenario: Pill while a turn runs
- **WHEN** a prompt is sent while the cache state is warm
- **THEN** the pill keeps its flame and width, and its alternative text names `cache in use`

#### Scenario: Cold pill
- **WHEN** the cache state is cold
- **THEN** the context pill shows a snowflake with a branch on each of its six arms, in the theme's text color

#### Scenario: No state
- **WHEN** no cache state is shown
- **THEN** the context pill is drawn as before, with no glyph and no added width

### Requirement: Cache line in the usage block
While a cache state is shown, the usage block's context row SHALL add a second dim line: `Cache in use` while a turn runs, `Cache cold in 38m` while warm, and `Cache cold, the next message re-reads 412K` once cold. The line SHALL start with the same cache glyph the context pill shows, drawn as the row icons are.

#### Scenario: Warm line
- **WHEN** the usage block is open and the cache state is warm with 38 minutes left
- **THEN** the context row shows a flame and `Cache cold in 38m` under its existing line

#### Scenario: Cold line
- **WHEN** the usage block is open, the cache state is cold and the context holds 412,000 tokens
- **THEN** the context row shows a snowflake and `Cache cold, the next message re-reads 412K`

#### Scenario: Other lines
- **WHEN** the usage block is open
- **THEN** the pace lines and the context range line show no icon
