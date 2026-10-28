# toolkit

Expands Claude Code with tools. Every tool is always on in the CLI. To stop using them, disable the plugin in `/plugin`.

In the Claude desktop app the toolkit does nothing: the app has its own versions of these tools. It knows the app by `CLAUDE_CODE_ENTRYPOINT=claude-desktop`.

```sh
claude plugin install toolkit@plugins
```

## Tools

### Mermaid preview

Draws each mermaid block of a reply as a picture in the chat, with no browser. **Show source** under a picture shows its source, and **Show picture** shows the picture again. If a block cannot be drawn, the source stays, with the reason and **Retry**.

- **Light and dark.** Each diagram is drawn for a light and a dark background. The picture follows Claude Code's `theme` setting. With `auto`, it follows the OS: GNOME's color scheme on Linux, the appearance on macOS. If the OS does not say, it is dark. A change shows within 5 seconds.
- **Long diagrams.** A diagram takes at most half the screen's height. A flowchart is also drawn the other way (left to right for a top to bottom one), and the way that shows larger is used. A diagram shown at less than 60% of its size gets **open full size**, which opens it in your image viewer.
- **Types.** It draws flowchart, sequence, class, state, ER and XY chart diagrams. Other types (gantt, pie, mindmap, gitGraph and more) stay as source.

It needs:

- Ghostty or kitty. It does not work through tmux. In other terminals, replies stay as they are.
- Node and npm. The first diagram installs `beautiful-mermaid` 1.1.3 and `@resvg/resvg-js` 2.6.2 (about 16 MB) into the cache folder, so it takes some time.

Pictures and the renderer are kept in `~/.cache/claude-mermaid`.

### Table copy

Puts two buttons under each table in a reply, in the terminal:

- **copy as markdown** copies the table as Claude wrote it.
- **copy table** copies the table for Teams, Google Sheets, Excel or another app that takes a formatted table. Plain-text apps get the cells, separated by tabs.

A formatted copy needs an X11 desktop and `python3`. Nothing else needs to be installed: a small script talks to the X11 clipboard through libX11. GNOME on Wayland can work too, for apps that read the X11 clipboard through XWayland. This is not tested. On macOS, or without X11, **copy table** copies the tab-separated cells only, and the toast says so.

If you still have the `table-copy` dev mod, remove it. With both, each table gets two rows of buttons.

### Quote copy

Puts a **copy text** button under each block quote in a reply, in the terminal. Claude writes message drafts, such as a Slack reply, as quotes.

The button copies the quote as plain text. Each line loses one `>` and the space after it, so a nested `>` stays. Paragraphs, lists and inline markdown stay as written. The copy has none of the terminal's padding or line breaks, so it pastes into Slack as one message.

A quote inside a code fence is not a quote.

### Change session directory (`cd`)

Gives Claude a tool, `change_session_directory`, that moves the session to another folder, the same as when you type `/cd`. Claude uses it when the work belongs to another project. After the move, Claude continues with the task it named.

The tool asks nothing of its own. The move runs when Claude's turn ends. Then Claude gets its task back as a new prompt, once, even when the move reloads the plugin. Claude Code's normal permission check for the tool still applies, so you are asked unless an allow rule or auto mode lets the call through. A path that is not a folder is refused.

In the terminal, the call shows as one row, **Move session** and the folder, with `~` for your home folder. The task is not shown. Under it, `moves when this turn ends`. An error shows its reason. Press ctrl+o to see the whole call.

If you still have the `auto-cd` dev mod, remove it. With both, Claude sees two tools that do the same thing.

### Restart Claude Code (`restart_claude_code`)

Gives Claude a tool, `restart_claude_code`, that exits Claude Code and starts it again in the same terminal, with the same conversation. A restart loads everything Claude Code reads only at startup: plugins and their MCP servers, settings, environment variables and a newly installed Claude Code version.

The restart runs when Claude's turn ends. The tool stops Claude Code with SIGTERM, which saves the transcript and restores the terminal as `/exit` does, but adds no `/exit` row. The new Claude Code runs `claude --resume <session id> --model <model>`. Claude can pass a first prompt for the resumed session. Without one, the session resumes and waits for you.

- **Why it needs a shell function.** Claude Code gives a plugin no way to relaunch the process. Once Claude Code exits, the shell takes the terminal back, so only the shell can start Claude Code again. The toolkit's `claude` function in `~/.bashrc` runs Claude Code with `CLAUDE_RESTART_FILE` set. The tool writes the next run's arguments to that file, and the function runs `claude` again with them. When the file is empty, the function returns Claude Code's exit code.
- **First use.** If Claude Code was not started through the function, the first call adds it to the end of `~/.bashrc`, between `# >>> toolkit restart >>>` and `# <<< toolkit restart <<<`, and restarts nothing. Run `source ~/.bashrc` or open a new terminal, then start `claude --continue`. A call also replaces a block that an older toolkit wrote. To remove the function, delete that block.
- **What is carried over.** The session, the model, and these options you started Claude Code with: `--plugin-dir`, `--add-dir`, `--permission-mode`, `--settings`, `--mcp-config`, `--strict-mcp-config` and `--dangerously-skip-permissions`. Other options are dropped, because they pick a session (`--continue`, `--resume`) or carry a first prompt, which the restart sets itself, or they are not on the list yet.
- **Running work.** A restart ends everything the session runs. The tool refuses while a subagent is running and names it. It cannot see background shells or monitors, so its description tells Claude to stop those first.
- **Bash only.** The function uses `mapfile`, so it works in bash, not in zsh or fish.

In the terminal, the call shows as one row, **Restart Claude Code**, with `restarts when this turn ends` under it. Press ctrl+o to see the whole call. It runs in an interactive terminal session only.

### Next step box (`wrap_up`)

Gives Claude a tool, `wrap_up`, with the Claude desktop app's name, schema and trigger. Claude calls it once at the end of every turn that changed files, ran commands or did multi-step work, and skips it for short answers and conversation. When the turn leaves you a decision, such as a go-ahead to commit or a choice of fix, the terminal draws it as Claude Code draws a tool call: `● Next step`, then a short recap under `⎿`, then one question and one or two links that answer it, separated by `·`. As on Desktop, a box with a question ends the turn. When the turn ends, the box moves under the turn's last reply text, so it is the last thing in the transcript, after any suggested session cards. Until you answer it, the box stays last: a later turn that ends with no box of its own, such as one a background task or another session starts, moves the box under its own reply. Once you answer, the box stays where it is and shows your choice. If you type your own prompt instead of pressing a link, the box goes away: its question is no longer open, and no later turn brings it back. The toolkit finds that text in the session's transcript, as for the suggested session cards. A turn that ends in an error, or a transcript that does not catch up within 3 seconds, leaves the box on the call's row. Claude makes the call first and writes its full reply after it. That reply is the text Claude Code needs after a turn's last tool call, so no placeholder such as a lone `.` is needed. A second call in the same turn replaces the first, so only one box shows. The detail is in the work above it. A turn with nothing to decide gets its full reply after the call too, and no box.

- **Only for a decision.** A call with a recap and no question draws nothing at all, not even its tool row, so a turn with nothing for you to decide looks as it does without the toolkit. The call is still made every time: a call on every working turn is a habit Claude keeps, where a call only when it judges a decision is waiting is one it forgets.
- **Why there is a rule at session start.** On Desktop the habit comes from a section of the app's system prompt, not from the tool's description. A tool description alone got 0 calls in 12 tries. So the toolkit gives Claude a short rule (`hooks/next-step-rule.md`, about 150 words) when a session starts, resumes, forks, clears or compacts. It is a plain command hook in `hooks/hooks.json`, because the built-in plugin guard skips context that a mod hook adds. The rule is given only in an interactive terminal session (`CLAUDE_CODE_ENTRYPOINT=cli`).
- **A link sends your answer.** A press sends the link's label, exactly as you see it, as your own prompt. Nothing hidden goes with it: the tool refuses a button that carries more text than its label. The links then give way to one dim line that names your choice, and they cannot be pressed again.
- **Common steps.** Claude can offer a common step, such as **Commit**, **Create PR** or **Fix CI**. In the terminal no app is behind these, so a press sends the label, and Claude does the step.
- **Waiting on you.** When Claude cannot go on until you answer, you also get a notification.
- **Full view.** ctrl+o shows the call and its result as Claude Code draws them.

It runs in an interactive terminal session only. The Claude desktop app has its own next step box, and a `claude -p` run has no one to press a button.

### Task list (`update_plan`)

Gives Claude a tool, `update_plan`, with the Claude desktop app's name and trigger. On a request that edits files or runs more than one command, Claude sends its whole plan with the turn's first tool call, then ticks each step off with the call that starts the next. The list looks and sits as Claude Code's own task list does on models that have it: `◻` for a step to do, `◼` in orange and bold for the step in progress, and `✔` in green for a done step, which is also dimmed and struck through. The marks tell the steps apart without the colors.

- **Where it shows.** While Claude works, the list is under the spinner line, after `⎿`. When Claude's turn ends, the list is hidden. A list with steps still open comes back under the spinner on the next turn. If the turn ends while background work still runs, such as a monitor or a background shell, the list stays above the prompt until the next turn starts, because that work wakes Claude again. The list goes away for good as soon as every step is done, and Claude's reply then says what now works.
- **No extra round trip.** Claude sends the call together with another tool call, never alone. Claude Code's own task tools are off for Opus 4.8, Sonnet 5 and newer models (changelog 2.1.233 and 2.1.268), and those cost a call of their own.
- **The list stays until Claude replaces or finishes it.** A prompt you type keeps the list, so a side question in the middle of the work does not remove it, and Claude can go on ticking steps off. The list goes away when Claude sends a new whole list, when every step is done, or when you rewind past the prompt it was made under.
- **Long lists.** A list of more than six steps shows five steps and a `… +N more` row. Click `… +N more` to show every step, and click `show less` to fold the list again. The choice stays for the session.
- **No rows in the transcript.** The list shows each change, so the calls and their results are hidden. ctrl+o shows them.
- **Why there is a rule at session start.** For the same reason as the next step box, Claude gets a short rule (`hooks/plan-rule.md`) from the same command hook.
- Desktop's `scope` field and its links to other sessions are left out, because the terminal has no session cards to open.

It runs in an interactive terminal session only. The Claude desktop app has its own list, and a `claude -p` run has no band to draw in.

### Other sessions (`start_session`, `hand_off_to_session`, `dismiss_task`, `list_sessions`, `stop_reports`)

Gives Claude the Claude desktop app's way to hand work to a separate session: its `start_session`, `hand_off_to_session` and `dismiss_task` tools, with Desktop's names, fields and rule. In the terminal, a new session is a background session (`claude --bg`). You can open it with `claude attach <id>`, talk to it and stop it, and it shows in `claude agents`.

- **Who asks.** As on Desktop, `initiation` says whose task it is.
  - **user_asked.** You told Claude to start it, so it starts now.
  - **offer.** You named a task ("suggest a session for X"). Claude Code's question dialog asks **New session** or **Do it here**, and Claude waits for your answer.
  - **own_initiative.** Claude proposes a follow-up it found, beyond what you asked. It shows as a card with **Start** and **Dismiss**, and nothing runs until you press Start or tell Claude to start it. A card expires after a week. Claude withdraws a stale card with `dismiss_task`. Work you asked for in that turn is never a card: the rule and the tool tell Claude to do it in the session, or to say plainly that it is not done. Plan steps that Claude splits into parallel sessions after you accept a plan are the exception.
- **Where a card shows.** While Claude works, a card shows on its call's row. When the turn ends, the card moves under the turn's last reply text, so it comes after the whole reply and before the next step box. After you press Start, it turns into the session's row in that place. The toolkit finds that text in the session's transcript, by the row id the reply is drawn under. The transcript can lag the end of the turn, so the toolkit reads it again for up to 3 seconds. The card stays on its call's row in these cases:
  - the turn ended in an error or a refusal
  - the turn has no reply text, or the transcript did not catch up in time
  - the session was reopened with `/resume`, which starts without the toolkit's state

  In the ctrl+O view, a moved card shows under the reply, and the call's full row shows too.
- **The row.** While `claude --bg` starts the session, the call's row says `starting…`. Then it shows the session's name, its state (`starting`, `working`, `idle`, `done`, `stopped`, `failed` or `removed`) and its branch. Under it are **claude attach &lt;id&gt;**, which copies that command, **stop** while it works, and **stop reports** while it runs.
- **The session reports back itself.** Each time a session Claude started ends a turn, it sends this session a message, as any other session's message arrives (`Message from @<name>`). The message holds the first 400 characters of its report: its next step box recap, then its last message. Claude checks the result before it tells you the work is done.
  - How it finds this session: right after `claude --bg` prints the new session's short id, the toolkit writes `~/.claude/toolkit/links/<short id>.json` with this session's id. The new session's toolkit reads it when a turn ends. The short id is the first 8 characters of the session id.
  - Reports go only to a session that is still open. Before it sends one, the session looks for this session's id in `claude agents --json`. If this session is closed, the report is dropped. If you open it again, reports come back.
  - **stop reports** on the row, or `stop_reports` when you ask Claude in words, ends the reports for good. It empties the link file, so the session keeps working but sends nothing. The row then says `no reports`. Use it when this session is still open but you have moved on.
  - A turn that Claude's own `SendMessage` follow-up started is reported too. Claude Code tells the sender of that turn only when `SendMessage` passes `notify_when_idle`, so the rule tells Claude not to pass it to a session it started.
  - A session that crashes, or is stopped or removed before it answers, sends nothing. Its row changes, and you get a toast. The toolkit looks at the linked sessions every 4 seconds for the rows and the toast.
  - A turn that another session's message or another automated message starts (a background task, a schedule) may propose sessions but not start them.
- **Where it works.**
  - `context` "fork" gets the whole conversation (`--resume --fork-session`).
  - "fresh" gets the brief and the background only.
  - From a worktree session, a new session gets its own worktree under `.claude/worktrees/`. Its branch is the `branch_name` Claude passes, used as given: the name the user gave, or the user's branch convention from CLAUDE.md or memory. Without one, it is `<type>/<name>`: `fix/blank-lines` for "Fix blank lines", or `feat/<name>` when the name does not start with a conventional-commit type. The worktree folder is the branch name with `-` for each `/`. When that branch or folder already exists, both get a short random suffix. A fresh one is cut from the default branch, and a fork from this branch's tip. From a plain checkout it shares the folder unless Claude passes `use_worktree`.
  - A session that shares a folder starts with `--settings '{"worktree":{"bgIsolation":"none"}}'`. Without it, Claude Code refuses a background session's edits in a git checkout it shares ("This background session hasn't isolated its changes yet"). Desktop's sessions have no such guard, so this keeps them alike. It applies to that one session only.
  - `cwd` names another folder. A fork there keeps this conversation. `target` "cloud" runs `claude --cloud`, which never reports back.
  - SSH hosts and presets do not exist in the terminal, so those fields are refused with the reason.
- **Your default permission mode.** A session starts in your own default mode. Claude passes `--permission-mode` only when you asked for a mode. You decide what a session may do, so the toolkit does not cap it.
- **Hand-off.** When you send a message about something else while Claude is in the middle of a task, Claude moves the unfinished task to a new session with `hand_off_to_session` and answers your message here. The new session is a fork of this conversation. Its first message is the task's title and the plan for what is left. It is told that your last message is answered here, so it does not act on it. In a worktree session, the fork gets its own worktree cut from this branch's tip, so Claude commits first. Edits that are not committed stay here. In a plain checkout, the fork works in the same folder and keeps your edits that are not committed, so the task loses nothing. Claude is then told to edit none of that task's files, because nothing else stops the two sessions from overwriting each other. When the task works in another repository, Claude passes that folder as `cwd`, and the fork works there. Desktop's tool has no `cwd`: it is added for work across several repositories. The folder must be one Claude Code trusts. The call's row is headed **Handed off**, and it shows the session as a started session's row does. The session reports back the same way. A turn that another session's message or another automated message starts cannot hand off.
- **Switch.** When you want to go on in a new session and leave this one, Claude calls `start_session` with `switch: true`. The new session starts with no link back, so it sends no reports. It works in this session's folder, a worktree included, so it keeps this branch and the edits not yet committed; this session closes, so the two never edit at once. Claude passes `use_worktree` true or `cwd` only when you want the new work kept apart. When Claude's turn ends, this session closes the way `restart_claude_code` closes it, and the toolkit's `claude` shell function runs `claude attach <id>` in the same terminal. When you leave the attached session (ctrl+Z), you are back in your shell. It needs the same `claude` shell function as a restart, and it is refused for a cloud session or while a subagent runs.
- **`list_sessions`.** `{"linked": true}` lists the sessions this one started. Without it, Claude gets `claude agents --json`.
- **Why there is a rule at session start.** Desktop's "Starting other sessions" section of its system prompt says when to start, offer or propose a session. The toolkit gives Claude the same section (`hooks/sessions-rule.md`) from the same command hook as the other rules.

Left out, because nothing behind them exists in the terminal yet:
- Desktop's `mark_chapter`.
- The linked sessions note that Desktop keeps current in Claude's context. Claude gets the list in each start result and report instead.
- Clickable session links.
- `list_start_targets`.

The linked sessions and the cards live in the session's plugin state, so a restart of Claude Code forgets them. The sessions themselves keep running.

It runs in an interactive terminal session only. The Claude desktop app has its own sessions, and a `claude -p` run has no one to answer a card.

## Add a tool

1. Write the tool as one file in `hooks/`, for example `hooks/my-tool.ts`. Export `register` from it. Put its tests beside it in `hooks/my-tool.test.ts`.
2. Add one line to `hooks/register.tsx`: `myTool(on, options)`.
3. Do not give a tool an on/off option. A model tool is declared at session start, and the plugin API cannot take it back, so an option switched off mid-session leaves the model a tool that fails.
4. Start each `$.state` key of the tool with its key, for example `myToolCount`, and declare it in `types/index.d.ts`.

The mermaid preview uses the state keys `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`. Its pictures have a transparent background, grey borders and `#D77757` arrowheads. The change session directory tool keeps a started move in `cdPending` until its task is submitted. The next step box uses `wrapUpAnswer`, keeps the running turn's call in `wrapUpPending`, the box under a reply in `wrapUpAt` and `wrapUpIsMoved`, and a box set aside by a typed prompt in `wrapUpIsDismissed`. The task list keeps the current list in `plan`, and whether a long list above the prompt is open in `planIsOpen`.

A tool that draws part of a reply does not get its own `ui.render` hook. The one hook runs on the terminal surface only, never for a summary. It splits the reply into text, mermaid blocks, quotes and tables (a table inside a mermaid block or a quote is not a table), and leaves a reply with only text, or any reply on the desktop, to the engine. It adds a block kind to `hooks/blocks.ts` and draws it in `hooks/reply.tsx`. A render hook on `AssistantMessage` draws the whole reply, so a second one would hide the first one's work.

Two rules of the hooks loader shape this:

- `on` can only be passed to a function named in the module. So `register.tsx` has one line per tool, not a loop over a table.
- One module cannot hook the same event twice without a matcher. The change session directory tool already hooks `session.start` with none. A new tool that hooks `session.start` must give a matcher that says when it applies, as mermaid does with `{ surface: 'terminal' }` and the next step box with `{ surface: 'terminal', isInteractive: true }`.

Run the checks:

```sh
claude plugin test plugins/toolkit
claude plugin validate plugins/toolkit
```
