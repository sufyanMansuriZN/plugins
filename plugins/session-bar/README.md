# session-bar

Session bar above the prompt: git, model, context and usage windows, following the transcript in view.

session-bar draws one row in the band above the prompt, in the terminal and in the desktop app:

```
main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h
```

When you open a subagent's transcript from the tasks list, the row shows that subagent instead of the main conversation:

```
main +3 ~2 · Explore · Haiku 4.5 · ctx 42K · 5h ━━━━━╾─╂─ 66%  behind  ↻46m · 7d ━━━╾╂──── 43% ↻3d21h
```

## Install

```
claude plugin install session-bar@plugins
```

There is no setup step. The row shows in the next session.

## What the row shows

Each part is left out when it has no value.

- **git**: the branch (a 7-character sha when detached), `+N` new files (untracked or added), `~M` changed files (modified, deleted or renamed). Left out outside a git repo. It is read at the session's start, at the end of each turn and every 30 seconds.
- **agent**: only while a subagent's transcript is open. Its type, such as `Explore`, in dim text.
- **model**: the model's name, such as `Opus 5.5`. In the main conversation, the context window size follows it (`1M`, `200K`). For a subagent, it is the model that subagent's requests use. It shows from the subagent's first request.
- **ctx**: in the main conversation, how full the context window is. Yellow from 70%, red from 85%. It shows after the first response. For a subagent, the input tokens of its last request (`ctx 42K`).
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
5h ━━━━╋━╾── 70%  ahead  ↻2h30m      ahead: 1.5 used cells after the tick, in orange
5h ━━━━╋━╾── 71%  far ahead  ↻2h30m  far ahead: the same cells, in vermillion
5h ━━╾─╂──── 30%  behind  ↻2h30m     behind: the use stops before the tick
5h ━━━━╋━━━━ 100%  used up  ↻2h30m   used up: all of the window is used
```

- When you are within 5 points of an even pace, you are on pace. The window shows no word, and no cell has a color.
- A used cell after the tick is use ahead of pace. If you keep this rate, you run out before the reset. The cell is orange, or vermillion when you are more than 20 points ahead or have used it all.
- Other used cells and the tick are in the normal color.

### Pace words

When you are off pace, a word follows the percent. The word has a colored background:

| Word | Background | Means |
|---|---|---|
| `ahead` | orange | Ahead of pace by more than 5 points, up to 20. |
| `far ahead` | vermillion | Ahead of pace by more than 20 points. |
| `behind` | sky blue | Behind pace by more than 5 points. Some of the window will not be used if you keep this rate. |
| `used up` | vermillion | 100% used. |

The text of each word is bold and black. The percent stays in the normal color, because the word tells the pace.

The three colors come from the Okabe-Ito set. People with the common kinds of color blindness can tell them apart, and orange and vermillion also differ in how light they are. But you never need the color, because the word says the same thing. The colors are the same in every theme. Black text on each one is easy to read in light and dark themes. The contrast is 9.3 : 1 on orange, 5.4 : 1 on vermillion and 9.1 : 1 on sky blue.

### Spend limit

The spend limit (`$`) has no reset time, so it has no pace. Its meter has no tick, and it shows no word. The used cells and the percent turn orange from 50% and vermillion from 80%:

```
$ ━━━───── 40%
$ ━━━━━━╾─ 80%
```

### Narrow bands

When the band is too narrow, the parts go in this order:

1. The git part is cut, down to 12 characters.
2. The meters go: `5h 66%  behind  ↻46m`.
3. The words go: `5h 66% ↻46m`.

The other parts are never cut. While a survey shows above the prompt, the row is hidden.
