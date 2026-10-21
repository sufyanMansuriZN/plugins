# session-bar

Session bar above the prompt: git, model, context and usage windows, following the transcript in view.

session-bar draws one row in the band above the prompt, in the terminal and in the desktop app:

```
main +3 ~2 · Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h
```

When you open a subagent's transcript from the tasks list, the row shows that subagent instead of the main conversation:

```
main +3 ~2 · Explore · Haiku 4.5 · ctx 42K · 5h 66% ↻46m · 7d 43% ↻3d21h
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
- **5h**, **7d**, **$**: the 5-hour and 7-day usage windows and the spend limit, with the time to the reset (`↻2h10m`). They are for the whole account, so they show in every view. A window turns yellow when it is more than 15 points ahead of an even pace through the window, and red when it is more than 30 ahead or at 90% or more. A window with no reset time turns yellow from 50% and red from 80%.

When the band is too narrow, the git part is cut first. The other parts are never cut. While a survey shows above the prompt, the row is hidden.
