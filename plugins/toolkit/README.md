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

### File links

Makes a file that Claude names in a reply clickable, in the terminal. Claude writes a file as a code span, such as `` `hooks/reply.tsx:187` ``. When that span names a file or folder that exists, the toolkit draws it as a link, and a plain click opens it.

- **Where it opens.**
  - Code and other text files open in your graphical editor, at the line when the span gives one. The editor is `$VISUAL`, else `$EDITOR`. A `--wait` or `-w` flag is dropped, so the click does not wait for the file to close. Zed and Sublime Text get `path:line`. VS Code, Cursor, VSCodium and Windsurf get `-g path:line`. Another editor gets the path alone.
  - Folders, pictures, PDFs, HTML pages, media and office files open in the desktop's app for their type (`xdg-open`, or `open` on macOS).
  - When neither variable is set, or it names an editor that draws in a terminal (vim, nano, emacs and the like), text files open in the desktop's app too. A click has no terminal to give such an editor.
- **Which spans.** A span with no spaces that holds a `/` or a file extension, with an optional `:line`, `:line:column` or `:line-line`. A range opens at its first line. A relative path is read from the session's folder, and `~/` from your home folder. A span inside a code fence stays as written, also when the fence is indented in a list. A path that does not exist stays as written too. A later reply that names it once it exists gets the link.
- **The rest of the reply.** A reply that names no existing file is drawn by Claude Code as before. A reply with a link is drawn by the toolkit's `Markdown`, which draws as a reply's text does. A ctrl+click still goes to the terminal, which opens the `file://` link itself.

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

Gives Claude a tool, `wrap_up`, with the Claude desktop app's name, schema and trigger. Claude calls it once at the end of every turn that changed files, ran commands or did multi-step work, and skips it for short answers and conversation. When the turn leaves you a decision, such as a go-ahead to commit or a choice of fix, the terminal draws it as Claude Code draws a tool call: `● Next step`, then a short recap under `⎿`, then one question and one or two links that answer it, separated by `·`. As on Desktop, a box with a question ends the turn. When the turn ends, the box moves under the turn's last reply text, so it is the last thing in the transcript, after the task list. Until you answer it, the box stays last: a later turn that ends with no box of its own, such as one a background task or another session starts, moves the box under its own reply. Once you answer, the box stays where it is and shows your choice. If you type your own prompt instead of pressing a link, the box goes away: its question is no longer open, and no later turn brings it back. The toolkit finds that text in the session's transcript. A turn that ends in an error, or a transcript that does not catch up within 3 seconds, leaves the box on the call's row. Claude makes the call first and writes its full reply after it. That reply is the text Claude Code needs after a turn's last tool call, so no placeholder such as a lone `.` is needed. A session shows one box at a time. A newer call with a question, in the same turn or a later one, removes the earlier box, answered or not. After `/resume` or a restart, which start without the toolkit's state, the toolkit reads the session's transcript: if its last box with a question has no prompt from you after it, that box shows again on its call's row, with its links. A message from a background task or another session also counts as a prompt there, as the transcript does not say who sent it. The detail is in the work above it. A turn with nothing to decide gets its full reply after the call too, and no box.

- **Only for a decision.** A call with a recap and no question draws nothing at all, not even its tool row, so a turn with nothing for you to decide looks as it does without the toolkit. The call is still made every time: a call on every working turn is a habit Claude keeps, where a call only when it judges a decision is waiting is one it forgets.
- **Why there is a rule at session start.** On Desktop the habit comes from a section of the app's system prompt, not from the tool's description. A tool description alone got 0 calls in 12 tries. So the toolkit gives Claude a short rule (`hooks/next-step-rule.md`, about 150 words) when a session starts, resumes, forks, clears or compacts. It is a plain command hook in `hooks/hooks.json`, because the built-in plugin guard skips context that a mod hook adds. The rule is given only in an interactive terminal session (`CLAUDE_CODE_ENTRYPOINT=cli`).
- **A link sends your answer.** A press sends the link's label, exactly as you see it, as your own prompt. Nothing hidden goes with it: the tool refuses a button that carries more text than its label. The links then give way to one dim line that names your choice, and they cannot be pressed again. The tool's description asks for labels of at most 24 characters, but a longer label is drawn as it is, not refused.
- **Subagents.** A subagent sees the tool too, but its call draws nothing, because the box is the main conversation's.
- **Common steps.** Claude can offer a common step, such as **Commit**, **Create PR** or **Fix CI**. In the terminal no app is behind these, so a press sends the label, and Claude does the step.
- **Waiting on you.** When Claude cannot go on until you answer, you also get a notification.
- **Full view.** ctrl+o shows the call and its result as Claude Code draws them.

It runs in an interactive terminal session only. The Claude desktop app has its own next step box, and a `claude -p` run has no one to press a button.

### Task list (`update_plan`)

Gives Claude a tool, `update_plan`, with the Claude desktop app's name and trigger. On a request that edits files or runs more than one command, Claude sends its whole plan with the turn's first tool call, then ticks each step off with the call that starts the next. The list looks and sits as Claude Code's own task list does on models that have it: `◻` for a step to do, `◼` in orange and bold for the step in progress, and `✔` in green for a done step, which is also dimmed and struck through. The marks tell the steps apart without the colors.

- **Where it shows.** The list is always at the end of the transcript, never in the band above the prompt, so it takes no rows from the scroll area.
  - While Claude works, the list is under the spinner line, after `⎿`.
  - When a turn that changed the list ends with steps still open, the list moves under the turn's last reply text. So you see what is left while Claude waits for you or for background work, such as a monitor or a background shell. It comes before the next step box. It goes back under the spinner when the next turn starts.
  - A turn that leaves the list alone, such as a side question, does not show it under its reply, so a list Claude set aside does not stay on screen.
  - The list goes away for good as soon as every step is done, and Claude's reply then says what now works.
  - With a subagent's transcript in view, the spinner shows no list, because the list is the main conversation's.
- **No extra round trip.** Claude sends the call together with another tool call, never alone. Claude Code's own task tools are off for Opus 4.8, Sonnet 5 and newer models (changelog 2.1.233 and 2.1.268), and those cost a call of their own.
- **The list stays until Claude replaces or finishes it.** A prompt you type keeps the list, so a side question in the middle of the work does not remove it, and Claude can go on ticking steps off. The list goes away when Claude sends a new whole list, when every step is done, or when you rewind past the prompt it was made under.
- **After a resume.** `--continue`, `--resume`, a fork or a restart starts a new process without the toolkit's state. So the toolkit reads the list back from the calls in the transcript, and `advance` goes on from it. A list that the last turn changed shows under the last reply again.
- **Subagents.** A subagent sees the tool too, but its call changes nothing, because the list is the main conversation's.
- **Long lists.** A list of more than six steps shows five steps and a `… +N more` row. Click `… +N more` to show every step, and click `show less` to fold the list again. The choice stays for the session.
- **No rows in the transcript.** The list shows each change, so the calls and their results are hidden. ctrl+o shows them.
- **Why there is a rule at session start.** For the same reason as the next step box, Claude gets a short rule (`hooks/plan-rule.md`) from the same command hook.
- Desktop's `scope` field and its links to other sessions are left out, because the terminal has no session cards to open.

It runs in an interactive terminal session only. The Claude desktop app has its own list, and a `claude -p` run has no band to draw in.

### Other sessions (`start_session`)

Gives Claude one tool, `start_session`, that starts a background session (`claude --bg`) for a task. You can open it with `claude attach <id>`, talk to it and stop it, and it shows in `claude agents`. Everything after the start is Claude Code's own: Claude talks to the session with `SendMessage`, and you list, open and stop sessions with `claude agents`.

- **When.** Claude starts a session only when you asked for separate, parallel or background work, or approved one. To suggest one, Claude puts it as a button in the next step box, and your press is the approval.
- **Fields.** `prompt` (the brief), `name` (its handle in `claude agents` and for `SendMessage`; a suffix is added when a session started here already has it), `context`, `use_worktree`, `cwd`, `model` and `permission_mode`.
  - `context` "fork" gets the whole conversation (`--resume --fork-session`) and works in this folder. "fresh" gets the prompt alone.
  - `use_worktree` true passes `-w <name>`: Claude Code cuts the worktree `.claude/worktrees/<name>` on branch `worktree-<name>`, from the remote default branch. Commits on your local default branch that are not pushed are not in it. It is the default for a fresh session when this session is in a worktree. Otherwise the session shares the folder, and starts with `--settings '{"worktree":{"bgIsolation":"none"}}'`, because Claude Code refuses a background session's edits in a git checkout it shares. That applies to that one session only.
  - `cwd` names another folder, used as it is.
  - A session starts in your own default mode. Claude passes `--permission-mode` only when you asked for a mode.
- **Hearing back.** The tool result tells Claude to call `SendMessage` with `notify_when_idle: true` and no message, and to pass it again with each follow-up. Claude Code then sends one notice when the session ends its turn, with the session's final message. Claude checks the result before it tells you the work is done.
- **No loops.** A turn that another session's message or another automated message starts (a schedule, a channel) cannot start a session. A turn that Claude's own background task wakes, such as a command run in the background or a subagent finishing, counts as the turn that started the task.
- **The row.** The call's row shows **New session** and the name, then the folder or worktree and **claude attach &lt;id&gt;**, which copies that command.
- **Why there is a rule at session start.** The rule (`hooks/sessions-rule.md`) says when to start a session, how to keep two writers apart, and how to hear back. It comes from the same command hook as the other rules.

It runs in an interactive terminal session only. The Claude desktop app has its own sessions, and a `claude -p` run has no one to open one.

### Comments on web pages (`open_tab`, `read_tab`, `reply_comment`, `resolve_comment`)

You comment on any web page in your own Chrome, with your logins, and the Claude Code session that owns the tab acts on each comment. It starts a turn even when the session is idle. It works like comments on a Claude artifact, but on any page.

- **Opening a page.** Claude calls `open_tab` with a URL. The page opens in your Chrome as a tab that belongs to this session, with a comment toolbar at the bottom right.
- **Commenting.** Press **Comment** and click an element, or press **Region** and drag a box. Type your comment and press Enter. Shift+Enter starts a new line, and Escape cancels. The toolbar takes a cropped screenshot of the part you marked. You can move to another tab right away.
- **Threads.** Each comment opens a thread with a numbered pin next to the part you marked. The thread's title names the nearest heading and the start of the text you marked. The thread shows "Waiting for <session>" until Claude answers with `reply_comment`. The toolbar counts the threads with answers you have not read; clicking the count opens the first one, and seeing the open thread clears it. A reply you type in the thread reaches the session as a new turn. Claude closes a thread with `resolve_comment`, and you can close one with **Resolve** in its header, which asks you to press again to confirm. A resolved pin turns grey, and a reply opens the thread again. Threads belong to the page's URL without its `#` part, so they show again after a reload or in a new tab. Only the session that got a comment can answer its thread. Threads with no activity for 30 days are removed.
- **What Claude gets.** The comment starts a turn whose prompt holds only what you typed and the comment's IDs. Claude then calls `read_tab` with the comment ID to get the URL, title, nearest heading, marked text, selector, position and the screenshot's path.
- **Page content is untrusted.** A page can hold text written to steer Claude, so page content never goes into the prompt. `read_tab` returns it in a block that starts and ends with a new random marker, labeled as data, not instructions. The toolbar sits in a closed shadow root, and it ignores clicks and keys that a script made, so a page cannot post a comment as you.
- **Hiding and turning off.** **Hide** (the down arrow) folds the toolbar into one button and hides the pins; the tab stays folded after a reload, and the button brings everything back. **Turn off** (the power button) removes the toolbar, and the tab stops sending comments to its session. Its threads are kept. Press the extension icon to bring the toolbar back and pick a session.
- **Checking a fix.** After a change, Claude calls `read_tab` with the tab ID and the comment's selector or rect, and can ask for a reload and for computed styles such as `padding-top`. The extension reads that part of the page again, also in a tab you are not looking at: whether it exists, its text, its size and position, and the styles. It takes no screenshot. A session can check only the tabs it owns, and the result comes back as page content in a marked block.
- **Pages you open yourself.** Click the extension icon on any tab. The toolbar opens a list of the running sessions by name and folder, and the session you pick gets that tab's comments. Click the session name in the toolbar to switch to another one. When no session runs, the list says to start one with `claude` in your project folder and press **Refresh**. Only your own clicks pick a session, not a page's scripts.
- **Routing.** A tab keeps its session when you reload or navigate inside it. Each session's toolkit writes a heartbeat every 10 seconds, and a session without one for 30 seconds counts as ended. When you send a comment to an ended session, the toolbar shows "No session. Pick one" with the list, and keeps your text and the part you marked. Press Enter again after you pick. A thread stays with the session that got its first comment, also after you switch the tab to another session.

**Setup.** The first CLI session copies the extension and its native messaging host to `~/.claude/toolkit/chrome-bridge/`. It registers the host in `~/.config/google-chrome/NativeMessagingHosts/com.toolkit.chrome_bridge.json`, and copies again whenever the toolkit's files change. Load the extension once:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Press **Load unpacked** and select `~/.claude/toolkit/chrome-bridge/extension`.

If the extension is not loaded or Chrome is not running, `open_tab` says so and gives these steps.

It needs Google Chrome on Linux and Node. It uses no remote debugging, no `debugger` permission and no network: Chrome talks to the host over native messaging, and the host and sessions share files. The toolbar is ported from [T3Code](https://github.com/pingdotgg/t3code) (MIT) at commit `8b44f42b14c8`.

Tests: `node --test chrome-bridge/host.test.mjs` for the host, and `node chrome-bridge/e2e.mjs` for the whole path. The end-to-end test runs Chrome for Testing headless with a throwaway profile and drives it over CDP. It never touches your own Chrome.

It runs in an interactive terminal session only.

### Cut from Desktop's version

Earlier versions copied the Claude desktop app's session tools whole. These parts were cut because Claude Code already does the job, or because they were rarely used:

- `initiation` and its three paths. `offer` asked "New session or Do it here?", which `AskUserQuestion` does. `own_initiative` put up a Start card, which a next step box button does. With them went `proposal_id`, `dismiss_task`, card expiry and moving cards under the reply.
- `list_sessions`. Claude Code's `ListAgents` lists sessions and whether each is busy or idle.
- The reports, `stop_reports` and the link files in `~/.claude/toolkit/links/`. `SendMessage` with `notify_when_idle` delivers the session's final message.
- The running sessions card, the session count on the hint line, the 4-second `claude agents` poll, the open-in places (tmux, Ghostty) and **stop**. `claude agents` lists, opens and stops sessions.
- `switch` and **open here**, which needed the `claude` shell function. Run `claude attach <id>` in your shell instead.
- `hand_off_to_session`. A fork start with the remaining plan as its prompt does the same.
- The toolkit's own worktrees and `branch_name`, `source_branch`. Claude Code's `-w` cuts the worktree.
- `title`, `background`, `effort`, `target` "cloud" and `environment`. `name` labels the session, and the prompt holds the background. `effort` and the cloud fields were never used.


## Usage log

The transcripts show each call Claude makes to a toolkit tool, but not a press on what the toolkit draws: a copy button, a file link, a next step answer, a session's **open in**. So the toolkit notes each press in a log of the session's own, `~/.claude/toolkit/usage/<session id>.jsonl`. Each press is one line with the time, the component it was drawn in and the button's key, such as `{"at":"2026-10-30T12:00:00.000Z","component":"AssistantMessage","element":"rich:1"}`. The reply's text, a link's target and an answer's label stay out. The log stays on your computer.

To see how the toolkit was used, run:

```sh
python3 -I plugins/toolkit/scripts/usage.py --since 2026-10-21
```

It reads the terminal sessions that started with the toolkit's rules and lists:

- each model tool's calls and the errors it returned (`--errors` lists every kind)
- how many questions in the next step box were answered with a press, and how many with a typed prompt
- the presses per button
- how many replies held a table, a quote, a mermaid block or a file that exists, which is what the drawing tools act on

## Add a tool

1. Write the tool as one file in `hooks/`, for example `hooks/my-tool.ts`. Export `register` from it. Put its tests beside it in `hooks/my-tool.test.ts`.
2. Add one line to `hooks/register.tsx`: `myTool(on, options)`.
3. Do not give a tool an on/off option. A model tool is declared at session start, and the plugin API cannot take it back, so an option switched off mid-session leaves the model a tool that fails.
4. Start each `$.state` key of the tool with its key, for example `myToolCount`, and declare it in `types/index.d.ts`.
5. Give each button a key that names its control, for example `rich:1`, and add the key to `CONTROLS` in `scripts/usage.py`, so its presses count for the tool.

The mermaid preview uses the state keys `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`. Its pictures have a transparent background, grey borders and `#D77757` arrowheads. The change session directory tool keeps a started move in `cdPending` until its task is submitted. The next step box uses `wrapUpAnswer`, keeps the running turn's call in `wrapUpPending`, the box under a reply in `wrapUpAt` and `wrapUpIsMoved`, and the one box the session draws in `wrapUpCurrent`. The task list keeps the current list in `plan`, the reply it shows under between turns in `planAt`, and whether a long list is open in `planIsOpen`. The restart tool keeps a pending restart in `restartPending`, and the sessions tool the sessions it started in `started`.

A tool that draws part of a reply does not get its own `ui.render` hook. The one hook runs on the terminal surface only, never for a summary. It splits the reply into text, mermaid blocks, quotes and tables (a table inside a mermaid block or a quote is not a table), and leaves a reply with only text, or any reply on the desktop, to the engine. It adds a block kind to `hooks/blocks.ts` and draws it in `hooks/reply.tsx`. A render hook on `AssistantMessage` draws the whole reply, so a second one would hide the first one's work.

Two rules of the hooks loader shape this:

- `on` can only be passed to a function named in the module. So `register.tsx` has one line per tool, not a loop over a table.
- One module cannot hook the same event twice without a matcher. The change session directory tool already hooks `session.start` with none. A new tool that hooks `session.start` must give a matcher that says when it applies, as mermaid does with `{ surface: 'terminal' }` and the next step box with `{ surface: 'terminal', isInteractive: true }`.

Run the checks:

```sh
claude plugin test plugins/toolkit
claude plugin validate plugins/toolkit
```
