# Proposal

## Why

Small mods that each add one tool to Claude Code pile up as separate plugins. Each one needs its own install, its own entry in the marketplace and its own README. Three exist now: `mermaid-preview`, a published plugin, `auto-cd`, a dev mod that lets the model move the session with `/cd`, and `table-copy`, a dev mod that copies a reply's tables. More will follow. One plugin that holds them all is one install. 
## What Changes

- Add a plugin, `toolkit`, under `plugins/toolkit/`. It "expands Claude Code with tools". Version 0.1.0, license MIT.
- Each tool is one file in `hooks/`, with its tests beside it. The root module `hooks/register.tsx` has one line per tool.
- Every tool is always on, with no option. The plugin adds no `/config` rows of its own.
- Move mermaid preview in, behaviour unchanged but for its session start hook, which now runs on the terminal surface only. Its state keys become `mermaidDir`, `mermaidDiagram` and `mermaidIsSource` under the `toolkit` plugin.
- Port the `table-copy` dev mod as table copy: under each table of a reply, `copy as markdown` and `copy table`. `copy table` puts HTML and tab-separated cells on the X11 clipboard at once through a `python3` script that talks to libX11, and copies the cells alone where that fails. No clipboard tool has to be installed.
- One `ui.render` hook on `AssistantMessage`, `hooks/reply.tsx`, draws a reply for both the mermaid preview and table copy, so a reply with a diagram and a table shows both.
- Port the `auto-cd` dev mod as the `cd` tool. The model calls it as `mcp__toolkit__change_session_directory`, with a required `path` and `task`. Its description, input schema, dialog and result texts are the live-tested dev copy's.
- Every move asks the person in a dialog. Only `Move` moves the session. `Stay`, typed text, a closed dialog and a `-p` run with no one to ask all deny the call. Permission rules and auto mode let a tool call through unasked, so the tool asks on its own, and no option skips it.
- **BREAKING** Remove `plugins/mermaid-preview/` and its marketplace entry. `mermaid-preview@plugins` can no longer be installed. Install `toolkit@plugins` instead.
- The root README lists `toolkit` in place of `mermaid-preview`, and `plugins/toolkit/README.md` describes each tool.

## Capabilities

### New Capabilities

- `toolkit`: one plugin that holds tools, with the mermaid preview, table copy and the change session directory tool as its first tools.

### Modified Capabilities

None. The `marketplace` spec names no plugin list, so swapping one entry changes none of its requirements.

## Impact

- `.claude-plugin/marketplace.json`: `mermaid-preview` replaced by `toolkit`.
- `plugins/mermaid-preview/` moved to `plugins/toolkit/` and then deleted.
- The `table-copy` dev mod copy stays as it is. With both loaded, a reply's tables get two button rows, so the user removes the dev mod.
- The `auto-cd` dev mod copy in `~/.claude/dev-mods/` stays as it is. With both loaded, the model sees two tools that move the session, so the user removes the dev mod once `toolkit` is installed.
- Diagrams drawn by `mermaid-preview` stay in `~/.cache/claude-mermaid` and are reused, because a diagram's file name does not depend on the plugin. Its old `$.state` values are not read.
