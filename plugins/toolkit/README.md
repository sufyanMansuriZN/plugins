# toolkit

Expands Claude Code with tools. Every tool is on when you install the plugin. The mermaid preview and table copy are always on. You can turn the change session directory tool off.

```sh
claude plugin install toolkit@plugins
```

## Tools

### Mermaid preview

Draws each mermaid block of a reply as a picture in the chat. A button under each picture shows its source, and a second press shows the picture again. If mermaid cannot draw a block, the source stays, with the reason and a Retry button.

It needs:

- Ghostty or kitty. It does not work through tmux. In other terminals, replies stay as they are.
- Node. mermaid-cli 12.0.0 runs through `npx`. The first run downloads mermaid-cli and Chromium, so the first picture takes some time.

Pictures are kept in `~/.cache/claude-mermaid`.

### Table copy

Puts two buttons under each table in a reply, in the terminal:

- **copy as markdown** copies the table as Claude wrote it.
- **copy table** copies the table for Teams, Google Sheets, Excel or another app that takes a formatted table. Plain-text apps get the cells, separated by tabs.

A formatted copy needs an X11 desktop and `python3`. Nothing else needs to be installed: a small script talks to the X11 clipboard through libX11. GNOME on Wayland can work too, for apps that read the X11 clipboard through XWayland. This is not tested. On macOS, or without X11, **copy table** copies the tab-separated cells only, and the toast says so.

If you still have the `table-copy` dev mod, remove it. With both, each table gets two rows of buttons.

### Change session directory (`cd`)

Gives Claude a tool, `change_session_directory`, that moves the session to another folder, the same as when you type `/cd`. Claude uses it when the work belongs to another project. After the move, Claude continues with the task it named.

Claude cannot move the session without you. Each move opens a dialog that shows the folder and Claude's plan there:

- **Move** moves the session when Claude's turn ends.
- **Stay** keeps the session where it is.
- If you type an answer, the session stays and Claude gets your words.
- If you close the dialog, or no one can answer it (a `claude -p` run), the session stays.

No permission rule, auto mode or option skips this dialog.

If you still have the `auto-cd` dev mod, remove it. With both, Claude sees two tools that do the same thing.

## Turn the change session directory tool off

1. Run `/plugin`.
2. Select `toolkit` and configure it.
3. Set `cd` to off.

When `cd` is off, the tool adds no hooks. Claude Code reloads the plugin with the new options.

## Add a tool

1. Write the tool as one file in `hooks/`, for example `hooks/my-tool.ts`. Export `register` from it. Put its tests beside it in `hooks/my-tool.test.ts`.
2. Add one line to `hooks/register.tsx`: `myTool(on, options)`.
3. To let people turn the tool off, gate that line, `if (options.myTool !== false) myTool(on, options)`, and add one boolean field to `userConfig` in `.claude-plugin/plugin.json`, with the same key, a title, a description and `"default": true`.
4. Start each `$.state` key of the tool with its key, for example `myToolCount`, and declare it in `types/index.d.ts`.

A tool that draws part of a reply does not get its own `ui.render` hook. It adds a block kind to `hooks/blocks.ts` and draws it in `hooks/reply.tsx`. A render hook on `AssistantMessage` draws the whole reply, so a second one would hide the first one's work.

Two rules of the hooks loader shape this:

- `on` can only be passed to a function named in the module. So `register.tsx` has one line per tool, not a loop over a table.
- One module cannot hook the same event twice without a matcher. The change session directory tool already hooks `session.start` with none. A new tool that hooks `session.start` must give a matcher that says when it applies, as mermaid does with `{ surface: 'terminal' }`.

Run the checks:

```sh
claude plugin test plugins/toolkit
claude plugin validate plugins/toolkit
```
