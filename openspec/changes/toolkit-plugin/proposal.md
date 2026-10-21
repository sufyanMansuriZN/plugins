# Proposal

## Why

Small mods that each add one tool to Claude Code pile up as separate plugins. Each one needs its own install, its own entry in the marketplace and its own README. Two exist now: `mermaid-preview`, a published plugin, and `auto-cd`, a dev mod that lets the model move the session with `/cd`. More will follow. One plugin that holds them all is one install, and a tool the user does not want is one switch in `/plugin`.

## What Changes

- Add a plugin, `toolkit`, under `plugins/toolkit/`. It "expands Claude Code with tools". Version 0.1.0, license MIT.
- Each tool is one file in `hooks/`, with its tests beside it. The root module `hooks/register.tsx` registers a tool's hooks only when its `userConfig` field is not `false`.
- `userConfig` has one boolean field per tool, `true` by default. The user turns a tool off in `/plugin`. The plugin adds no `/config` rows of its own.
- Move mermaid preview in as the `mermaid` tool, behaviour unchanged. Its state keys become `mermaidDir`, `mermaidDiagram` and `mermaidIsSource` under the `toolkit` plugin.
- Port the `auto-cd` dev mod as the `cd` tool. The model calls it as `mcp__toolkit__cd`.
- **BREAKING** Remove `plugins/mermaid-preview/` and its marketplace entry. `mermaid-preview@plugins` can no longer be installed. Install `toolkit@plugins` instead.
- The root README lists `toolkit` in place of `mermaid-preview`, and `plugins/toolkit/README.md` describes each tool.

## Capabilities

### New Capabilities

- `toolkit`: one plugin that holds tools, each turned off through its own `userConfig` field, with the mermaid preview and the cd tool as its first tools.

### Modified Capabilities

None. The `marketplace` spec names no plugin list, so swapping one entry changes none of its requirements.

## Impact

- `.claude-plugin/marketplace.json`: `mermaid-preview` replaced by `toolkit`.
- `plugins/mermaid-preview/` moved to `plugins/toolkit/` and then deleted.
- The `auto-cd` dev mod copy in `~/.claude/dev-mods/` stays as it is. With both loaded, the model sees two `cd` tools, so the user removes the dev mod once `toolkit` is installed.
- Diagrams drawn by `mermaid-preview` stay in `~/.cache/claude-mermaid` and are reused, because a diagram's file name does not depend on the plugin. Its old `$.state` values are not read.
