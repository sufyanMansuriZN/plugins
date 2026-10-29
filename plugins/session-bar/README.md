# session-bar

Repo, branch, model, context and usage windows on the status line; a subagent's model and context above the prompt while its transcript is open.

session-bar draws in two places in the CLI:

- **The status line**, below the prompt, shows the main conversation: the repo, the branch, the model, the prompt cache, the context and the usage windows.
- **The band above the prompt** draws only while a subagent's transcript is open. It shows that subagent's type, model and context.

```
❯
  plugins (main) · Opus 5.5 1M   cache 52m · ctx ╾╂──── 60K · 5h ━━━╾╂─ 66%  behind  46m · 7d ━━╉─── 43% 3d21h · Fable ━╉──── 19%  behind  5d1h
```

When you open a subagent's transcript from the tasks list, the band shows that subagent above the prompt. The status line stays the same:

```
Explore · Haiku 4.5                                                                ctx 42K
❯
```

The band is there because Claude Code's status line input always describes the main conversation. With a subagent's transcript open, the status line still names the main model and context. The band knows which transcript is in view.

In the Claude desktop app, the band draws nothing and does no work, as the app shows the model, the context and the usage itself. It knows the app by `CLAUDE_CODE_ENTRYPOINT=claude-desktop`. The desktop app runs no status line.

## Install

1. Install the plugin:

   ```
   claude plugin install session-bar@plugins
   ```

2. Get a copy of this repo, if you do not have one. The status line runs a script from it with [bun](https://bun.sh).
3. Add the status line to `~/.claude/settings.json`. Put the path of your copy in place of `<repo>`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "bun <repo>/plugins/session-bar/statusline.ts",
       "refreshInterval": 2
     }
   }
   ```

4. Start a new session.

The status line is a setting of your own: installing the plugin does not add it. Without steps 2 and 3, you get only the band for subagents. The main conversation then shows nothing.

### Update from 3.x

3.x drew everything in the band. 4.0.0 moves the main conversation to the status line. Do steps 2 to 4 above, or you lose it. If you already have a `statusLine` setting, the new one replaces it.

## The status line

Each part is left out when it has no value. The left zone has the repo, the branch and the model. The right zone has the cache, the context and the usage windows, in that order, at the right end of the line.

- **repo**: the name of the repo's folder. In a git worktree, it is the name of the main repo, not of the worktree folder. Outside a git repo, it is the name of the session's directory. The session's directory is where the session started, or where `/cd` moved it. A `cd` that the agent runs in its shell does not change it.
- **branch**: the branch, or a 7-character sha when detached. It is in parentheses right after the repo name: `plugins (main)`. Without a repo name, it shows with no parentheses. Left out outside a git repo.
- **model**: the main conversation's model, such as `Opus 5.5`, with its context window size (`1M`, `200K`).
- **cache**: while the prompt cache is warm, the time until it goes cold: `cache 52m`. It comes first in the right zone.
- **ctx**: a meter of the main conversation's context window and the tokens in it (`60K`). From the tick, the count has a vermillion background. It shows after the first reply. See [Context meter](#context-meter).
- **5h** and **7d**: the usage windows, as this session's last reply reported them. They are for the whole account, but they change only when this session gets a reply. While this session is idle, use from your other sessions does not show. When a window resets while this session is idle, it is left out until the next reply.
- **Fable**, and one window per model with its own weekly limit: from session-bar's own reading of the account's usage, which each running session takes every 5 minutes. Claude Code does not put these windows in the status line input. A reading older than 15 minutes is left out.

Each usage window shows a meter, the percent used, a word for the pace when you are off pace, and the time to the reset (`2h10m`).

Claude Code runs the script after each reply, when the model or the mode changes, every `refreshInterval` seconds, and at each window's reset and the cache's expiry. Each run reads git again. A resize of the terminal does not run it, so the line fits a new width only at the next run. With `refreshInterval` at 2, that is within 2 seconds. A run takes about 40 ms of CPU, so 2 seconds costs about 2% of one core per session.

## The band

The band draws a row only while a subagent's transcript is open. In the main view it draws nothing.

- **agent**: the subagent's type, such as `Explore`, in dim text.
- **model**: the model that the subagent's requests use. It shows from the subagent's first request.
- **ctx**: the input tokens of the subagent's last request (`ctx 42K`), with no meter.

While a survey shows above the prompt, the band's row is hidden.

## Meter and pace

The goal is to use 100% of a window just as it resets. An even pace gets there at a steady rate, day and night, for 5h, 7d and each model window.

The meter has 5 cells. Each cell is one fifth of the window:

- `━` is a used cell.
- `╾` is a half-used cell. It is thick on its left half only.
- `─` is an unused cell. It is dim.

The tick shows where an even pace is now, at the nearest cell boundary. The tick joins the line of the meter. Each side of the tick is thick when the cell next to it is used on that side, and thin when it is not. So you can see if your use stops before the tick, at it, or goes past it.

When half of the window has gone, the tick is after cell 3:

```
5h ━━╾╂── 50% 2h30m              on pace: the use ends next to the tick
5h ━━━╋╾─ 70%  ahead  2h30m      ahead: used cells after the tick
5h ━━━╋╾─ 71%  far ahead  2h30m  far ahead: more than 20 points ahead
5h ━╾─╂── 30%  behind  2h30m     behind: the use stops before the tick
5h ━━━╋━━ 100%  used up  2h30m   used up: all of the window is used
```

- When you are within 5 points of an even pace, you are on pace. The window shows no word.
- A used cell after the tick is use ahead of pace. If you keep this rate, you run out before the reset.
- The meter never has a color. Used cells are in the normal color, and unused cells are dim. The tick is dim when the cell after it is unused, so its thin arms match the line next to it.

### Context meter

The ctx meter on the status line has the same 5 cells. A full meter is the whole context window of the model, so on a 1M model each cell is 200K tokens.

The tick is fixed. It marks the context size to stay under:

| Model window | Tick at | Why |
|---|---|---|
| More than 200K | 250K | Anthropic's long-context scores drop past about 256K. |
| 200K or less | 160K | A 200K window compacts at 200K, so the tick leaves room before that. |

The sources are in [research-context-size.md](docs/research-context-size.md).

```
ctx ╾╂──── 60K      1M window: the tick is after cell 1
ctx ━╋╾───  300K    1M window, past the tick: the count has a vermillion background
ctx ━━━─╂─ 120K     200K window: the tick is after cell 4
ctx ━━━━╋╾  170K    200K window, past the tick
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

## Colors

The meters use color only as the background of a word or a number, with bold black text on it. No other text, cell or tick in them has a color of its own.

On the status line, the branch uses two colors of the oh-my-zsh robbyrussell prompt:

| Part | Color |
|---|---|
| ` (` and `)` | bold blue |
| The branch (`main`) | red |

These are the terminal's own named colors, which your terminal theme sets for light and dark. The repo name stays in the normal color: robbyrussell's cyan has a contrast of about 2 : 1 on a light theme. Claude Code draws the status line's plain text in grey, so there "the normal color" is that grey.

This keeps every alert easy to read in light and dark themes. Colored text sits on the terminal's own background, and the plugin does not know that color. For example, orange text on a white background has a contrast of only about 2.3 : 1. Black text on a fixed color has the same contrast in every theme: 9.3 : 1 on orange, 5.4 : 1 on vermillion and 9.1 : 1 on sky blue.

The three colors come from the Okabe-Ito set. People with the common kinds of color blindness can tell them apart, and orange and vermillion also differ in how light they are. But you never need the color, because the word or the number says the same thing.

Three things get a colored background:

| What | Orange from | Vermillion from |
|---|---|---|
| A pace word | `ahead` | `far ahead`, `used up` (`behind` is sky blue) |
| The percent of a window with no reset time | 50% | 80% |
| The context tokens (`ctx`) | none | the tick: 250K, or 160K on a 200K window |

Below those values, the percent or the token count is in the normal color.

## Narrow lines

When the status line is too narrow, the parts go in this order:

1. The branch is cut, down to 12 characters.
2. The meters go: `5h 66%  behind  46m`.
3. The words go: `5h 66% 46m`.
4. The branch is cut more, then it goes. A cut branch stays in its parentheses: `plugins (f…)`. When the branch goes, the parentheses go too.
5. The repo name is cut.

The ctx meter goes with the window meters at step 2: `ctx 60K`. A cut part ends with `…`. The model, the cache, the context and the usage windows are never cut. The script fits the line in the terminal's width less the 4 cells Claude Code keeps free, so Claude Code does not cut it.

In the band, the agent and the model are never cut.

## How it works

These rules are for whoever changes the plugin. The tests in `hooks/` hold the exact rows for each case.

- **Two drawers, one layout.** The band and the status line both lay out their row with `segments()` in `hooks/bar.ts`. The band passes a subagent's type, model and tokens. The status line passes the repo, git, the main model and context (`model.id`, `context_window`), the windows and the cache. The cache comes first in the right zone.
- **The band.** One hooks module draws the row in the `AbovePrompt` band, on the terminal and desktop surfaces, fitted to the band's `bodyColumns`, only when `e.props.view.agentId` is set. In the main view it passes the event on. A drawing writes no state.
- **The status line.** `statusline.ts`, run by bun, reads Claude Code's statusLine JSON on stdin and prints one line with SGR escapes: a badge is `1;38;2;0;0;0;48;2;R;G;B`, the branch `31`, the parentheses `1;34`, and plain and dim text none. Claude Code draws the line's text grey already, and dim on that grey is too faint to read. It fits the line in `COLUMNS` less 4. Claude Code trims a line's leading spaces, so a right zone with no left zone starts the line. Input that is not JSON prints nothing.
- **Desktop app.** When `CLAUDE_CODE_ENTRYPOINT` is `claude-desktop`, every hook passes the event on untouched: no timer, no fetch, no file, no row. Any other entrypoint, `-p` included, runs as below.
- **Git.** The script runs `git --no-optional-locks -C <workspace.project_dir> status --porcelain=v2 --branch` and `git worktree list --porcelain`, each stopped after 2 seconds. A slow or failed run leaves out its part. A detached HEAD with no commit reads `HEAD`. The repo name is the last part of the path of the first tree that the worktree list names, else of `project_dir`.
- **Usage.** The 5h and 7d windows come from the statusLine JSON's `rate_limits`. The model windows come from one call to the account's usage endpoint, made by the band's module with `$.http.fetch` and the handle from `$.session.authorize()`, so the plugin never sees the credential. It runs at session start, at each turn's end, and every 5 minutes. Each answer with windows is written as `{ at, limits }` to `session-bar/limits.json` under `$XDG_CACHE_HOME` when that is an absolute path, else under `~/.cache`. A failed call writes nothing. The script reads that file and keeps its model windows while `at` is at most 15 minutes old.
- **Subagents.** The band reads `e.props.view`. The plugin learns each subagent's model and input tokens (uncached, cache read and cache written) from `turn.step` events that carry `agentId`. It writes state only when a reading changes. Main-loop steps write nothing. The type comes from `$.agent.list()`.
- **Model label.** `claude-<name>-<major>-<minor>`, with an optional `-<8-digit date>` and `[1m]`, reads `<Name> <major>.<minor>`. An id of any other shape shows as given.
- **Inputs are parsed where they enter.** A window with a percent that is not a finite number is left out. A reset that is not a number counts as no reset time. A cache shows only when `prompt_cache.warm` is `true` and `expires_at` is a number. A context whose `total_input_tokens` is not above 0 (no reply yet), or whose `context_window_size` is not above 0, is left out, and the model label then has no size. A shared reading of any other shape gives no windows.
- **Pace.** `mark` = the share of the window gone × 100, and `delta` = percent − mark. 100% or more is used up. Within 5 points is on pace. Ahead by more than 20 is far ahead. The tick stands at cell boundary round(mark / 20). The meter has halves = round(percent / 10), capped at 10.
- **Colors.** Orange `#E69F00`, vermillion `#D55E00`, sky blue `#56B4E9`, with bold `#000000` text, fixed in every theme.
