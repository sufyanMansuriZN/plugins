# Design

## Context

`plugins/mermaid-preview/` is a hooks module of one file, `hooks/register.tsx`, with its tests and a `$.state` contract in `types/index.d.ts`. The `auto-cd` dev mod is one file, `hooks/register.ts`. It registers a model tool `cd` on `session.start`. Its `tool.call` hook checks the path with `$.fs.stat`, then runs `/cd` and submits a continuation prompt from a `$.clock.after(0, …)` timer, because a `$.command.run` straight from the tool hook is refused. It was tested live.

The engine loads one hooks module per plugin (`hooks/hooks.json` names one path). `register(on, options)` gets the `userConfig` values with defaults filled in.

## Goals / Non-Goals

**Goals:**
- One plugin, many tools. Adding a tool is one new file, one line in `hooks/register.tsx` and one `userConfig` field.
- Every tool is on by default and can be turned off in `/plugin`.
- Mermaid preview behaves as before. The cd tool behaves as the dev mod did.

**Non-Goals:**
- No `/config` rows from the plugin's own hooks.
- No migration of `mermaid-preview`'s old `$.state` values. Pictures on disk are reused, the state is rebuilt.
- No change to the dev mod copy of `auto-cd`.

## Decisions

**The root module is a list of gated calls, not a loop over a table.** The planned shape was a table `{ mermaid, cd }` and a loop that calls each entry when its option is not `false`. The loader refuses it: `on` may only be passed to a function named at the top of the module or imported from the plugin's own files, so `TOOLS[key](on, options)` fails the load. So `register.tsx` holds one line per tool, `if (options.<key> !== false) <tool>(on, options)`. Each line is the registry entry. It stays one line per tool, and a test per tool proves the gate.

**A tool that is off registers no hooks.** The gate is at registration, not inside each hook. An off tool costs nothing per event, and a tool file needs no knowledge of options. A change in `/plugin` reloads the module with new options, so no hook has to read the option at run time.

**One file per tool.** `hooks/mermaid.tsx` and `hooks/cd.ts` each export `register`. Tests sit beside them (`mermaid.test.tsx`, `cd.test.ts`). Pure helpers stay exported from the tool file, as before.

**State keys carry the tool's name.** `$.state` is keyed by plugin, and all tools now share `toolkit`. Mermaid's keys become `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`, so a later tool cannot collide with them.

**The cd tool keeps its name `cd`.** Tools a plugin registers are listed to the model as `mcp__<plugin>__<name>`, so it becomes `mcp__toolkit__cd`. The `tool.call` matcher names that full id.

**Diagram pictures are reused.** A picture's file name is a hash of the drawing settings and the source, and the cache folder is still `~/.cache/claude-mermaid`. So pictures drawn by `mermaid-preview` are found on disk and not drawn again.

## Risks / Trade-offs

- [The dev mod and `toolkit` both loaded] → The model sees two `cd` tools. The README says to remove the dev mod.
- [A user had `mermaid-preview` installed] → It no longer updates. They install `toolkit@plugins` and uninstall `mermaid-preview@plugins`.
- [The root module grows one line per tool] → Accepted. The loader rule leaves no shorter form, and each line is the same shape.

## Migration Plan

1. Move `plugins/mermaid-preview/` to `plugins/toolkit/`, rename the state keys and add the `mermaid` option. Swap the marketplace entry in the same commit, so no commit lists a folder that is gone.
2. Add the `cd` tool and its option.
3. Update the READMEs.
4. Live check in a session, then archive this change.
