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

If you still have the `auto-cd` dev mod, remove it. With both, Claude sees two tools that do the same thing.

## Add a tool

1. Write the tool as one file in `hooks/`, for example `hooks/my-tool.ts`. Export `register` from it. Put its tests beside it in `hooks/my-tool.test.ts`.
2. Add one line to `hooks/register.tsx`: `myTool(on, options)`.
3. Do not give a tool an on/off option. A model tool is declared at session start, and the plugin API cannot take it back, so an option switched off mid-session leaves the model a tool that fails.
4. Start each `$.state` key of the tool with its key, for example `myToolCount`, and declare it in `types/index.d.ts`.

The mermaid preview uses the state keys `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`. The change session directory tool keeps a started move in `cdPending` until its task is submitted. Its pictures have a transparent background, grey borders and `#D77757` arrowheads.

A tool that draws part of a reply does not get its own `ui.render` hook. The one hook runs on the terminal surface only, never for a summary. It splits the reply into text, mermaid blocks, quotes and tables (a table inside a mermaid block or a quote is not a table), and leaves a reply with only text, or any reply on the desktop, to the engine. It adds a block kind to `hooks/blocks.ts` and draws it in `hooks/reply.tsx`. A render hook on `AssistantMessage` draws the whole reply, so a second one would hide the first one's work.

Two rules of the hooks loader shape this:

- `on` can only be passed to a function named in the module. So `register.tsx` has one line per tool, not a loop over a table.
- One module cannot hook the same event twice without a matcher. The change session directory tool already hooks `session.start` with none. A new tool that hooks `session.start` must give a matcher that says when it applies, as mermaid does with `{ surface: 'terminal' }`.

Run the checks:

```sh
claude plugin test plugins/toolkit
claude plugin validate plugins/toolkit
```
