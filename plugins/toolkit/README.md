# toolkit

Expands Claude Code with tools. Every tool is always on. To stop using them, disable the plugin in `/plugin`.

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

### Next step box (`wrap_up`)

Gives Claude a tool, `wrap_up`, with the Claude desktop app's name, schema and trigger. Claude calls it once at the end of every turn that changed files, ran commands or did multi-step work, and skips it for short answers and conversation. When the turn leaves you a decision, such as a go-ahead to commit or a choice of fix, the terminal draws it as Claude Code draws a tool call: `● Next step`, then a short recap under `⎿`, then one question and one or two links that answer it, separated by `·`. As on Desktop, a box with a question ends the turn: Claude writes nothing after it, so the box is the last thing in the reply, where you look. The detail is in the work above it. A turn with nothing to decide gets its full reply after the call instead.

- **Only for a decision.** A call with a recap and no question draws nothing at all, not even its tool row, so a turn with nothing for you to decide looks as it does without the toolkit. The call is still made every time: a call on every working turn is a habit Claude keeps, where a call only when it judges a decision is waiting is one it forgets.
- **Why there is a rule at session start.** On Desktop the habit comes from a section of the app's system prompt, not from the tool's description. A tool description alone got 0 calls in 12 tries. So the toolkit gives Claude a short rule (`hooks/next-step-rule.md`, about 150 words) when a session starts, resumes, forks, clears or compacts. It is a plain command hook in `hooks/hooks.json`, because the built-in plugin guard skips context that a mod hook adds. The rule is given only in an interactive terminal session (`CLAUDE_CODE_ENTRYPOINT=cli`).
- **A link sends your answer.** A press sends the link's label, exactly as you see it, as your own prompt. Nothing hidden goes with it: the tool refuses a button that carries more text than its label. The links then give way to one dim line that names your choice, and they cannot be pressed again.
- **Common steps.** Claude can offer a common step, such as **Commit**, **Create PR** or **Fix CI**. In the terminal no app is behind these, so a press sends the label, and Claude does the step.
- **Waiting on you.** When Claude cannot go on until you answer, you also get a notification.
- **Full view.** ctrl+o shows the call and its result as Claude Code draws them.

It runs in an interactive terminal session only. The Claude desktop app has its own next step box, and a `claude -p` run has no one to press a button.

### Task list (`update_plan`)

Gives Claude a tool, `update_plan`, with the Claude desktop app's name and trigger. On a request that edits files or runs more than one command, Claude sends its whole plan with the turn's first tool call, then ticks each step off with the call that starts the next. The list looks and sits as Claude Code's own task list does on models that have it: `◻` for a step to do, `◼` in orange and bold for the step in progress, and `✔` in green for a done step, which is also dimmed and struck through. The marks tell the steps apart without the colors.

- **Where it shows.** While Claude works, the list is under the spinner line, after `⎿`. When Claude stops with steps still open, it stays above the prompt under a `3 tasks (1 done, 2 open)` line. A list with every step done goes when the turn ends. Only the band's `[-]` mark differs from Claude Code's own list.
- **No extra round trip.** Claude sends the call together with another tool call, never alone. Claude Code's own task tools are off for Opus 4.8, Sonnet 5 and newer models (changelog 2.1.233 and 2.1.268), and those cost a call of their own.
- **One list per request.** As on Desktop, a list belongs to the request that sent it. A prompt you send while Claude is idle starts a new request, and the list goes away, even one Claude left unfinished. A turn that goes on with the plan sends the whole list again. A message you type while Claude works, and a turn that a finished background task starts, keep the list.
- **No rows in the transcript.** The list shows each change, so the calls and their results are hidden. ctrl+o shows them.
- **Why there is a rule at session start.** For the same reason as the next step box, Claude gets a short rule (`hooks/plan-rule.md`) from the same command hook.
- Desktop's `scope` field and its links to other sessions are left out, because the terminal has no session cards to open.

It runs in an interactive terminal session only. The Claude desktop app has its own list, and a `claude -p` run has no band to draw in.

## Add a tool

1. Write the tool as one file in `hooks/`, for example `hooks/my-tool.ts`. Export `register` from it. Put its tests beside it in `hooks/my-tool.test.ts`.
2. Add one line to `hooks/register.tsx`: `myTool(on, options)`.
3. Do not give a tool an on/off option. A model tool is declared at session start, and the plugin API cannot take it back, so an option switched off mid-session leaves the model a tool that fails.
4. Start each `$.state` key of the tool with its key, for example `myToolCount`, and declare it in `types/index.d.ts`.

The mermaid preview uses the state keys `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`. Its pictures have a transparent background, grey borders and `#D77757` arrowheads. The change session directory tool keeps a started move in `cdPending` until its task is submitted. The next step box uses `wrapUpAnswer`. The task list keeps the current list in `plan`.

A tool that draws part of a reply does not get its own `ui.render` hook. The one hook runs on the terminal surface only, never for a summary. It splits the reply into text, mermaid blocks, quotes and tables (a table inside a mermaid block or a quote is not a table), and leaves a reply with only text, or any reply on the desktop, to the engine. It adds a block kind to `hooks/blocks.ts` and draws it in `hooks/reply.tsx`. A render hook on `AssistantMessage` draws the whole reply, so a second one would hide the first one's work.

Two rules of the hooks loader shape this:

- `on` can only be passed to a function named in the module. So `register.tsx` has one line per tool, not a loop over a table.
- One module cannot hook the same event twice without a matcher. The change session directory tool already hooks `session.start` with none. A new tool that hooks `session.start` must give a matcher that says when it applies, as mermaid does with `{ surface: 'terminal' }` and the next step box with `{ surface: 'terminal', isInteractive: true }`.

Run the checks:

```sh
claude plugin test plugins/toolkit
claude plugin validate plugins/toolkit
```
