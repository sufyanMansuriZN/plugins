# session-bar

Session bar above the prompt: git, model, context and usage windows, following the transcript in view.

session-bar draws one row in the band above the prompt, in the terminal and in the desktop app:

```
main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h ━━━━━─── 66% 56m behind ↻46m · 7d ━━━───── 43% on pace ↻3d21h
```

When you open a subagent's transcript from the tasks list, the row shows that subagent instead of the main conversation:

```
main +3 ~2 · Explore · Haiku 4.5 · ctx 42K · 5h ━━━━━─── 66% 56m behind ↻46m · 7d ━━━───── 43% on pace ↻3d21h
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
- **5h**, **7d**, **$**: the 5-hour and 7-day usage windows and the spend limit. They are for the whole account, so they show in every view. Each one shows a meter, the percent used, a pace word and the time to the reset (`↻2h10m`).

### Pace

The goal is to use 100% of a window just as it resets. The pace word compares your use with an even pace through the window:

| Word | Means | Color |
|---|---|---|
| `30m ahead` | You used what an even pace uses in 30 more minutes. If you keep this rate, you run out before the reset. | Yellow. Red when more than 20 points ahead. |
| `on pace` | You are within 5 points of an even pace. | Green |
| `1h behind` | An even pace would have used 1 more hour's share by now. If you keep this rate, some of the window is not used. | Blue |
| `used up` | You used 100%. | Red |

The percent has the same color as the word.

### Meter

The meter has 8 cells. A thick cell (`━`) is used, a thin cell (`─`) is not. The meter also shows where an even pace is now:

- A used cell before that point is in the normal color.
- A used cell past it is yellow or red. This is use ahead of pace.
- An unused cell before it is blue. This is use you still have to catch up.
- An unused cell past it is dim.

The spend limit (`$`) has no reset time. It has a meter and a percent but no pace word. It turns yellow from 50% and red from 80%.

### Narrow bands

When the band is too narrow, the git part is cut first, down to 12 characters. Then the meters go, then the pace words. The other parts are never cut. While a survey shows above the prompt, the row is hidden.
