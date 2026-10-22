# Design

## Context

`plugins/mermaid-preview/` is a hooks module of one file, `hooks/register.tsx`, with its tests and a `$.state` contract in `types/index.d.ts`. The `auto-cd` dev mod is one file, `hooks/register.ts`. It registers a model tool `cd` on `session.start`. Its `tool.call` hook checks the path with `$.fs.stat`, then runs `/cd` and submits a continuation prompt from a `$.clock.after(0, …)` timer, because a `$.command.run` straight from the tool hook is refused. It was tested live. The `table-copy` dev mod is a `ui.render` hook on `AssistantMessage` with a pure table parser in `hooks/tables.ts`. It hands the text up to the first table to the engine and draws the rest itself, with two buttons under each table. It was tested live.

The engine loads one hooks module per plugin (`hooks/hooks.json` names one path). `register(on, options)` gets the `userConfig` values with defaults filled in.

## Goals / Non-Goals

**Goals:**
- One plugin, many tools. Adding a tool is one new file and one line in `hooks/register.tsx`.
- Every tool is always on. The mermaid preview and table copy only add to a reply, and leave it to the engine where they have nothing to add. The change session directory tool never moves the session without approval.
- Mermaid preview behaves as before. Table copy behaves as the dev copy does, but needs no clipboard tool installed. The change session directory tool behaves as the dev copy does, and never moves the session without the person's approval.

**Non-Goals:**
- No `/config` rows from the plugin's own hooks.
- No migration of `mermaid-preview`'s old `$.state` values. Pictures on disk are reused, the state is rebuilt.
- No change to the dev mod copies of `auto-cd` and `table-copy`.
- No formatted table copy on macOS yet. There, `copy table` copies the cells only.

## Decisions

**The root module is a list of calls, not a loop over a table.** The planned shape was a table `{ mermaid, cd }` and a loop that calls each entry when its option is not `false`. The loader refuses it: `on` may only be passed to a function named at the top of the module or imported from the plugin's own files, so `TOOLS[key](on, options)` fails the load. So `register.tsx` holds one line per tool, `<tool>(on, options)`. Each line is the registry entry.

**One hook draws a reply.** The mermaid preview and table copy each draw part of a reply, and a render hook on `AssistantMessage` returns the whole reply. Stacked, the outer hook draws its text parts as plain Markdown, so the inner hook's diagrams or buttons are lost. So `hooks/reply.tsx` holds the one render hook. `hooks/blocks.ts` splits the reply into a typed list, `text`, `mermaid` (a closed fence) or `table`. Mermaid fences come out first, so a table inside one is never a table. Fences come out only once session start has found a terminal that draws pictures. A reply with no block but text goes to the engine unchanged. Otherwise the hook draws each block in order inside the engine's frame: a blank row above, the bullet on the first block of a reply, every block indented two columns. This is mermaid's frame, so the bullet shows once. The dev copy of table copy passed the text up to the first table to the engine instead, but a reply can open with a diagram or a table, and then there is no text to pass. A later tool that draws part of a reply adds a block kind and its drawing here. `$` cannot be passed to a helper, so the drawing stays inside the hook, and the parsing stays in pure files.

**Copy table talks to the X11 clipboard itself.** `$.ui.copy` holds plain text only, and Teams and spreadsheets need `text/html` to paste a table. The dev copy needed a clipboard manager that most machines do not have. Now `copy table` runs a `python3` script, kept as a string in `hooks/clipboard.ts`. It takes the X11 `CLIPBOARD` through libX11 with ctypes, offers `text/html` and the tab-separated cells as `UTF8_STRING`, `text/plain`, `STRING` and `TEXT`, and serves them from a detached process until another app takes the clipboard. It exits 0 once it owns the clipboard. Any other exit, or a run that fails (no `python3`), falls back to `$.ui.copy` of the cells, with a toast that says a formatted copy needs an X11 desktop. That covers macOS and Wayland with no XWayland.

**Only one tool may hook an event with no matcher.** The loader also refuses a module that hooks one event twice without a matcher. Both tools hook `session.start`. Mermaid's hook now matches `{ surface: 'terminal' }`, because it only draws in a terminal; a `-p` run or an SDK host starts with no surface, and mermaid has nothing to draw there. The change session directory tool keeps its hook unmatched, because the desktop app needs the tool too. A later tool that hooks `session.start` must give a matcher of its own, or the hooks move to the root.

**No tool has an option.** The change session directory tool had a `cd` switch in `userConfig`, gated at registration. The live check showed it cannot work: the tool is declared to the model with `$.tool.register` at session start, and the plugin API has no way to take a declared tool back. Switched off mid-session, the module reloads without its `tool.call` hook, the model still lists the tool, and its call fails. So the switch is gone and every tool is always on. Disabling the plugin is the off switch.

**One file per tool.** `hooks/mermaid.ts` and `hooks/cd.ts` each export `register`. Tests sit beside them (`mermaid.test.tsx`, `cd.test.ts`). Pure helpers stay exported from the tool file, as before. Table copy has no hooks of its own: its parser is `hooks/tables.ts`, and the reply hook draws its buttons.

**State keys carry the tool's name.** `$.state` is keyed by plugin, and all tools now share `toolkit`. Mermaid's keys become `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`, so a later tool cannot collide with them.

**The tool is named `change_session_directory`.** The model picks tools by name and description, and `cd` reads like a shell command. The name, the description (what it does, when to use it, when not to), the input schema and the texts come verbatim from the live-tested dev copy. Tools a plugin registers are listed to the model as `mcp__<plugin>__<name>`, so it becomes `mcp__toolkit__change_session_directory`. The `mcp__` prefix is the engine's name for every plugin tool; no MCP server is involved.

**The tool asks the person itself.** In a live test, auto mode let the call through with no prompt, so permission rules cannot be the gate. After the directory check, the hook calls `$.ui.ask` with `Stay` first, then `Move`. Only the exact answer `Move` queues the move. `Stay`, text typed under Other, and a rejected ask (a closed dialog, or a `-p` run) all return `{ deny }` with a reason the model reads, and queue nothing. There is no "don't ask again".

**Diagram pictures are reused.** A picture's file name is a hash of the drawing settings and the source, and the cache folder is still `~/.cache/claude-mermaid`. So pictures drawn by `mermaid-preview` are found on disk and not drawn again.

## Risks / Trade-offs

- [The dev mod and `toolkit` both loaded] → The model sees two tools that move the session. The README says to remove the dev mod.
- [The dialog resolves with nobody there] → `AskUserQuestion` results can carry `afkTimeoutMs` when the dialog auto-resolves after idle, and `$.ui.ask` returns only the label. The engine refuses a plugin's direct `AskUserQuestion` call ("that is $.ui.ask (host check)"), so the hook cannot read that marker. `Stay` is listed first, so an idle dialog that takes the first option keeps the session. Whether an idle dialog can pick another option is not known. The live check (task 5.1) leaves the dialog open past the idle time and confirms the session stays.
- [A user had `mermaid-preview` installed] → It no longer updates. They install `toolkit@plugins` and uninstall `mermaid-preview@plugins`.
- [The root module grows one line per tool] → Accepted. The loader rule leaves no shorter form, and each line is the same shape.
- [A reply with a table now draws through the plugin] → Every text block of such a reply is the plugin's `Markdown`, not the engine's own drawing, as mermaid replies already were. A difference in spacing or styling is possible. The live check (task 5.1) compares a reply with a table against one without.
- [The X11 clipboard script stays running] → It is one detached process that exits when another app takes the clipboard, so a second copy replaces the first. Tested by the user on X11 GNOME. GNOME on Wayland, where apps read the X11 clipboard through XWayland, is not tested.
- [The `table-copy` dev mod and `toolkit` both loaded] → Each table gets two button rows. The README says to remove the dev mod.

## Migration Plan

1. Move `plugins/mermaid-preview/` to `plugins/toolkit/` and rename the state keys. Swap the marketplace entry in the same commit, so no commit lists a folder that is gone.
2. Add the change session directory tool and its `cd` option.
3. Move mermaid's render hook into one reply hook, then add table copy to it.
4. Update the READMEs.
5. Live check in a session, then archive this change.
