# session-bar

Session bar above the prompt: git, model, context and usage windows, following the transcript in view.

session-bar draws one row in the band above the prompt, in the terminal and in the desktop app. The row has two zones. The left zone tells you where you are: the repo, the branch and the model. The right zone has the meters, at the right edge of the band:

```
plugins · main +3 ~2 · Opus 5.5 1M   ctx ╾─╂────── 60K · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h
```

When you open a subagent's transcript from the tasks list, the row shows that subagent instead of the main conversation:

```
plugins · main +3 ~2 · Explore · Haiku 4.5     ctx 42K · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h
```

The free room goes between the two zones. There are always at least 3 spaces between them.

## Install

```
claude plugin install session-bar@plugins
```

There is no setup step. The row shows in the next session.

## What the row shows

Each part is left out when it has no value. The left zone has the repo, git, agent and model. The right zone has ctx and the usage windows.

- **repo**: the name of the repo's folder. In a git worktree, it is the name of the main repo, not of the worktree folder. Outside a git repo, it is the name of the session's directory. It is read when git is read.
- **git**: the branch (a 7-character sha when detached), `+N` new files (untracked or added), `~M` changed files (modified, deleted or renamed). Left out outside a git repo. It is read at the session's start, at the end of each turn and every 30 seconds.
- **agent**: only while a subagent's transcript is open. Its type, such as `Explore`, in dim text.
- **model**: the model's name, such as `Opus 5.5`. In the main conversation, the context window size follows it (`1M`, `200K`). For a subagent, it is the model that subagent's requests use. It shows from the subagent's first request.
- **ctx**: in the main conversation, a meter of the context window and the tokens in the context (`60K`). From the tick, the count has a vermillion background. It shows after the first response. See [Context meter](#context-meter). For a subagent, the input tokens of its last request (`ctx 42K`), with no meter.
- **5h**, **7d**, **$**: the 5-hour and 7-day usage windows and the spend limit. They are for the whole account, so they show in every view. Each one shows a meter, the percent used, a word for the pace when you are off pace, and the time to the reset (`↻2h10m`).

### Meter and pace

The goal is to use 100% of a window just as it resets. An even pace gets there at a steady rate, day and night, for both 5h and 7d.

The meter has 8 cells. Each cell is one eighth of the window:

- `━` is a used cell.
- `╾` is a half-used cell. It is thick on its left half only.
- `─` is an unused cell. It is dim.

The tick shows where an even pace is now. The tick joins the line of the meter. Each side of the tick is thick when the cell next to it is used on that side, and thin when it is not. So you can see if your use stops before the tick, at it, or goes past it.

When half of the window has gone, the tick is in the middle:

```
5h ━━━━╉──── 50% ↻2h30m              on pace: the use stops at the tick
5h ━━━━╋━╾── 70%  ahead  ↻2h30m      ahead: 1.5 used cells after the tick
5h ━━━━╋━╾── 71%  far ahead  ↻2h30m  far ahead: the same cells, more than 20 points ahead
5h ━━╾─╂──── 30%  behind  ↻2h30m     behind: the use stops before the tick
5h ━━━━╋━━━━ 100%  used up  ↻2h30m   used up: all of the window is used
```

- When you are within 5 points of an even pace, you are on pace. The window shows no word.
- A used cell after the tick is use ahead of pace. If you keep this rate, you run out before the reset.
- The meter never has a color. Used cells and the tick are in the normal color, and unused cells are dim.

### Context meter

The ctx meter has the same 8 cells as the 5h and 7d meters. A full meter is the whole context window of the model, so on a 1M model each cell is 125K tokens.

The tick is fixed. It marks the context size to stay under:

| Model window | Tick at | Why |
|---|---|---|
| More than 200K | 250K | Anthropic's long-context scores drop past about 256K. |
| 200K or less | 160K | A 200K window compacts at 200K, so the tick leaves room before that. |

The sources are in [research-context-size.md](../../openspec/changes/archive/2026-10-03-session-bar-visual-redesign/research-context-size.md).

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

The row uses color only as the background of a word or a percent, with bold black text on it. No text, cell or tick in the row has a color of its own.

This keeps every alert easy to read in light and dark themes. Colored text sits on the terminal's own background, and the plugin does not know that color. For example, orange text on a white background has a contrast of only about 2.3 : 1. Black text on a fixed color has the same contrast in every theme: 9.3 : 1 on orange, 5.4 : 1 on vermillion and 9.1 : 1 on sky blue.

The three colors come from the Okabe-Ito set. People with the common kinds of color blindness can tell them apart, and orange and vermillion also differ in how light they are. But you never need the color, because the word or the number says the same thing.

Three things get a colored background:

| What | Orange from | Vermillion from |
|---|---|---|
| A pace word | `ahead` | `far ahead`, `used up` (`behind` is sky blue) |
| The spend limit percent | 50% | 80% |
| The context tokens (`ctx`) | none | the tick: 250K, or 160K on a 200K window |

Below those values, the percent or the token count is in the normal color.

### Spend limit

The spend limit (`$`) has no reset time, so it has no pace. Its meter has no tick, and it shows no word. From 50%, the percent has an orange background. From 80%, it is vermillion. The meter stays in the normal color:

```
$ ━━━───── 40%
$ ━━━━━━╾─  80%
```

### Reset mark

In the terminal, the time to the reset starts with a refresh icon from the Nerd Font symbols (U+F021) and a space. The icon sits in the center of its cell, and `↻` does not. Ghostty includes the Nerd Font symbols, so it shows the icon with no setup. In a terminal whose font has no Nerd Font symbols, you see a box in its place. The desktop app uses its own fonts, so it shows `↻`. The examples here show `↻`.

### Narrow bands

When the band is too narrow, the parts go in this order:

1. The git part is cut, down to 12 characters.
2. The meters go, the ctx meter too: `ctx 60K · 5h 66%  behind  ↻46m`.
3. The words go: `5h 66% ↻46m`.
4. The git part is cut more, then it goes.
5. The repo name is cut.

A cut part ends with `…`. The agent, the model and the parts in the right zone are never cut. While a survey shows above the prompt, the row is hidden.
