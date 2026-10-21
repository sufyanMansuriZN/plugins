# session-bar

Session bar above the prompt: git, model, context and usage windows, following the transcript in view.

session-bar draws one row in the band above the prompt, in the terminal and in the desktop app:

```
main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h ━━━━━──╂─ 66% ↻46m · 7d ━━━─╂──── 43% ↻3d21h
```

When you open a subagent's transcript from the tasks list, the row shows that subagent instead of the main conversation:

```
main +3 ~2 · Explore · Haiku 4.5 · ctx 42K · 5h ━━━━━──╂─ 66% ↻46m · 7d ━━━─╂──── 43% ↻3d21h
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
- **5h**, **7d**, **$**: the 5-hour and 7-day usage windows and the spend limit. They are for the whole account, so they show in every view. Each one shows a meter, the percent used and the time to the reset (`↻2h10m`).

### Meter and pace

The goal is to use 100% of a window just as it resets. An even pace gets there at a steady rate, day and night, for both 5h and 7d.

The meter has 8 cells. A thick cell (`━`) is used, a thin cell (`─`) is not. The tick shows where an even pace is now. Each side of the tick is thick or thin like the cell next to it, so you can see if the use goes past the tick. When half of the window has gone, the tick is in the middle:

```
5h ━━━━╋━━── 70% ↻2h30m    ahead: the 2 used cells after the tick are yellow
5h ━━──╂──── 30% ↻2h30m    behind: the 2 unused cells before the tick are blue
5h ━━━━╉──── 50% ↻2h30m    on pace: the use stops at the tick
```

- A used cell after the tick is yellow. This is use ahead of pace. If you keep this rate, you run out before the reset. The cell is red when you are more than 20 points ahead.
- An unused cell before the tick is blue. This is use you still have to catch up. If you keep this rate, some of the window is not used.
- Other used cells and the tick are in the normal color. Other unused cells are dim.
- When you are within 5 points of an even pace, no cell is yellow, red or blue.

The percent shows the pace in its color:

| Color | Means |
|---|---|
| Green | On pace: within 5 points of an even pace. |
| Yellow | Ahead of pace by up to 20 points. |
| Red | Ahead of pace by more than 20 points, or 100% used. |
| Blue | Behind pace by more than 5 points. |

The spend limit (`$`) has no reset time. It has a meter with no tick. The meter and the percent turn yellow from 50% and red from 80%.

### Narrow bands

When the band is too narrow, the git part is cut first, down to 12 characters. Then the meters go, and each window shows only its percent and its reset time (`5h 66% ↻46m`). The percent keeps its color. The other parts are never cut. While a survey shows above the prompt, the row is hidden.
