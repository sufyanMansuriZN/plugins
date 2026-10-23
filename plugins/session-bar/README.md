# session-bar

Session bar above the prompt: git, model, context and usage windows, following the transcript in view.

session-bar draws one row in the band above the prompt, in the terminal and in the desktop app. The row has two zones. The left zone tells you where you are: the repo, the branch and the model. The right zone has the meters, at the right edge of the band:

```
plugins (main +3 ~2) · Opus 5.5 1M   ctx ╾─╂────── 60K · 5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h
```

When you open a subagent's transcript from the tasks list, the row shows that subagent instead of the main conversation:

```
plugins (main +3 ~2) · Explore · Haiku 4.5     ctx 42K · 5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h
```

The free room goes between the two zones. There are always at least 3 spaces between them.

## Install

```
claude plugin install session-bar@plugins
```

There is no setup step. The row shows in the next session.

## What the row shows

Each part is left out when it has no value. The left zone has the repo, git, agent and model. The right zone has ctx and the usage windows.

- **repo**: the name of the repo's folder. In a git worktree, it is the name of the main repo, not of the worktree folder. Outside a git repo, it is the name of the session's directory. The session's directory is where the session started, or where `/cd` moved it. A `cd` that the agent runs in its shell does not change it. It is read when git is read, and again the first time the bar draws after a `/cd`.
- **git**: the branch (a 7-character sha when detached), `+N` new files (untracked or added), `~M` changed files (modified, deleted or renamed). It is in parentheses right after the repo name: `plugins (main +3 ~2)`. Without a repo name, it shows with no parentheses. Left out outside a git repo. It is read at the session's start, at the end of each turn and every 30 seconds.
- **agent**: only while a subagent's transcript is open. Its type, such as `Explore`, in dim text.
- **model**: the model's name, such as `Opus 5.5`. In the main conversation, the context window size follows it (`1M`, `200K`). For a subagent, it is the model that subagent's requests use. It shows from the subagent's first request.
- **ctx**: in the main conversation, a meter of the context window and the tokens in the context (`60K`). From the tick, the count has a vermillion background. It shows after the first response. See [Context meter](#context-meter). For a subagent, the input tokens of its last request (`ctx 42K`), with no meter.
- **5h**, **7d**, and one per model with its own weekly limit: the usage windows. They are for the whole account, so they show in every view. Each one shows a meter, the percent used, a word for the pace when you are off pace, and the time to the reset (`2h10m`), with no icon before it.

### Meter and pace

The goal is to use 100% of a window just as it resets. An even pace gets there at a steady rate, day and night, for both 5h and 7d.

The meter has 8 cells. Each cell is one eighth of the window:

- `━` is a used cell.
- `╾` is a half-used cell. It is thick on its left half only.
- `─` is an unused cell. It is dim.

The tick shows where an even pace is now. The tick joins the line of the meter. Each side of the tick is thick when the cell next to it is used on that side, and thin when it is not. So you can see if your use stops before the tick, at it, or goes past it.

When half of the window has gone, the tick is in the middle:

```
5h ━━━━╉──── 50% 2h30m              on pace: the use stops at the tick
5h ━━━━╋━╾── 70%  ahead  2h30m      ahead: 1.5 used cells after the tick
5h ━━━━╋━╾── 71%  far ahead  2h30m  far ahead: the same cells, more than 20 points ahead
5h ━━╾─╂──── 30%  behind  2h30m     behind: the use stops before the tick
5h ━━━━╋━━━━ 100%  used up  2h30m   used up: all of the window is used
```

- When you are within 5 points of an even pace, you are on pace. The window shows no word.
- A used cell after the tick is use ahead of pace. If you keep this rate, you run out before the reset.
- The meter never has a color. Used cells are in the normal color, and unused cells are dim. The tick is dim when the cell after it is unused, so its thin arms match the line next to it.

### Context meter

The ctx meter has the same 8 cells as the 5h and 7d meters. A full meter is the whole context window of the model, so on a 1M model each cell is 125K tokens.

The tick is fixed. It marks the context size to stay under:

| Model window | Tick at | Why |
|---|---|---|
| More than 200K | 250K | Anthropic's long-context scores drop past about 256K. |
| 200K or less | 160K | A 200K window compacts at 200K, so the tick leaves room before that. |

The sources are in [research-context-size.md](docs/research-context-size.md).

```
ctx ╾─╂────── 60K        1M window: the tick is after cell 2
ctx ━━╋╾─────  300K      1M window, past the tick: the count has a vermillion background
ctx ━━━━━─╂── 120K       200K window: the tick is after cell 6
ctx ━━━━━━╋━─  170K      200K window, past the tick
```

From the tick, the token count has a vermillion background. Below the tick, it is in the normal color. If the window is smaller than its tick, the meter has no tick.

### Pace words

When you are off pace, a word follows the percent. The word has a colored background:

| Word | Background | Means |
|---|---|---|
| `ahead` | orange | Ahead of pace by more than 5 points, up to 20. |
| `far ahead` | vermillion | Ahead of pace by more than 20 points. |
| `behind` | sky blue | Behind pace by more than 5 points. Some of the window will not be used if you keep this rate. |
| `used up` | vermillion | 100% used. |

The text of each word is bold and black. The percent stays in the normal color, because the word tells the pace.

### Colors

The meters use color only as the background of a word or a percent, with bold black text on it. No text, cell or tick in the right zone has a color of its own.

In the terminal, the branch uses two colors of the oh-my-zsh robbyrussell prompt:

| Part | Color |
|---|---|
| ` (` and `)` | bold blue |
| The branch (`main`) | red |

These are the terminal's own named colors, which your terminal theme sets for light and dark. The repo name and the counts (`+3 ~2`) stay in the normal color: robbyrussell's cyan and yellow have a contrast of about 2 : 1 on a light theme. The desktop app has no such colors, so there the repo and the branch are in the normal color, with dim parentheses.

This keeps every alert easy to read in light and dark themes. Colored text sits on the terminal's own background, and the plugin does not know that color. For example, orange text on a white background has a contrast of only about 2.3 : 1. Black text on a fixed color has the same contrast in every theme: 9.3 : 1 on orange, 5.4 : 1 on vermillion and 9.1 : 1 on sky blue.

The three colors come from the Okabe-Ito set. People with the common kinds of color blindness can tell them apart, and orange and vermillion also differ in how light they are. But you never need the color, because the word or the number says the same thing.

Three things get a colored background:

| What | Orange from | Vermillion from |
|---|---|---|
| A pace word | `ahead` | `far ahead`, `used up` (`behind` is sky blue) |
| The spend limit percent | 50% | 80% |
| The context tokens (`ctx`) | none | the tick: 250K, or 160K on a 200K window |

Below those values, the percent or the token count is in the normal color.

### Model windows

A model with its own weekly limit, such as Fable, gets a meter named after the model. It is a 7-day window, so its meter has a pace tick like the 7d one. It shows last, after 5h and 7d.

### Narrow bands

When the band is too narrow, the parts go in this order:

1. The git part is cut, down to 12 characters.
2. The meters go, the ctx meter too: `ctx 60K · 5h 66%  behind  46m`.
3. The words go: `5h 66% 46m`.
4. The git part is cut more, then it goes. A cut git part stays in its parentheses: `plugins (f…)`. When the git part goes, the parentheses go too.
5. The repo name is cut.

A cut part ends with `…`. The agent, the model and the parts in the right zone are never cut. While a survey shows above the prompt, the row is hidden.

## How it works

These rules are for whoever changes the plugin. The tests in `tests/` hold the exact rows for each case.

- **Drawing.** One hooks module draws the row in the `AbovePrompt` band, on the terminal and desktop surfaces. It never uses Claude Code's `statusLine` setting. It fits the row in the band's `bodyColumns`. A drawing writes no state.
- **Git.** `git --no-optional-locks status --porcelain=v2 --branch`, run with `$.process.run` in `$.session.root()`, with a 2-second limit. A slow or failed run leaves out the git part, and the band still draws. A detached HEAD with no commit reads `HEAD`.
- **Repo name.** The last part of the path of the first tree that `git worktree list --porcelain` names. A failed read keeps the last value. The name is written to state only when it changes.
- **Refresh.** A `$.clock.every(30000)` timer and each `session.measure` bump a `tick` state value, so countdowns move while idle and new usage shows at once. Git is read at session start, at each turn's end, on the timer, and when the band draws with a root other than the one last read.
- **Usage.** Every usage meter comes from one call to the account's usage endpoint, made with `$.http.fetch` and the handle from `$.session.authorize()`, so the plugin never sees the credential. It runs at session start, at each turn's end, and every 5 minutes. The last reading is kept in `$.store`, so a new session draws it until the first fetch lands. The render only reads that reading and never fetches. If the call fails or the reply has no windows, the last reading stays.
- **Subagents.** The band reads `e.props.view`. The plugin learns each subagent's model and input tokens (uncached, cache read and cache written) from `turn.step` events that carry `agentId`. It writes state only when a reading changes. Main-loop steps write nothing. The type comes from `$.agent.list()`.
- **Model label.** `claude-<name>-<major>-<minor>`, with an optional `-<8-digit date>` and `[1m]`, reads `<Name> <major>.<minor>`. An id of any other shape shows as given.
- **Inputs are parsed where they enter.** A limit with a `percent` that is not a finite number is left out. A `resetsAt` that does not parse counts as no reset time. A context with no finite `tokens`, or a `window` that is not above 0, is left out. Usage limits other than the session, the weekly total and a model's weekly window are ignored.
- **Pace.** `mark` = the share of the window gone × 100, and `delta` = percent − mark. 100% or more is used up. Within 5 points is on pace. Ahead by more than 20 is far ahead. The tick stands at cell boundary round(mark / 12.5). The meter has halves = round(percent / 100 × 16), capped at 16.
- **Colors.** Orange `#E69F00`, vermillion `#D55E00`, sky blue `#56B4E9`, with bold `#000000` text, fixed in every theme.
