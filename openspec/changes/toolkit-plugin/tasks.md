# Tasks

## 1. Move mermaid preview in

- [x] 1.1 Move `plugins/mermaid-preview/` to `plugins/toolkit/`, the module to `hooks/mermaid.tsx` and its tests to `hooks/mermaid.test.tsx`. Rename the state keys to `mermaidDir`, `mermaidDiagram` and `mermaidIsSource` under `toolkit`. Verify: `git ls-files plugins/mermaid-preview` prints nothing.
- [x] 1.2 Add `hooks/register.tsx` with the gated `mermaid` line, and the `mermaid` boolean field in `userConfig`. Verify: `claude plugin test plugins/toolkit` passes the ported tests and a test where `mermaid: false` leaves session start and replies to the engine.
- [x] 1.3 Replace the `mermaid-preview` entry in `.claude-plugin/marketplace.json` with `toolkit`. Verify: `claude plugin validate plugins/toolkit` passes.

## 2. Add the change session directory tool

- [x] 2.1 Port the `auto-cd` dev copy to `hooks/cd.ts`, matching `mcp__toolkit__change_session_directory`, and add its gated line and the `cd` field. Give mermaid's session start hook the `{ surface: 'terminal' }` matcher. Verify: `claude plugin test plugins/toolkit` passes: a path that is not a directory is denied with no dialog, `Move` runs `/cd <realPath>` and then submits a prompt with the task, `Stay`, typed text, a closed dialog and a `-p` run deny and run no command, and with `cd: false` the tool is not registered.
- [x] 2.2 Type-check the hooks and the state contract. Verify: `tsc` passes against the bundled `claude-code.d.ts`.

## 3. Docs

- [x] 3.1 Replace the `mermaid-preview` bullet in `README.md` with `toolkit`, and add `plugins/toolkit/README.md`: each tool, the approval dialog, how to turn one off in `/plugin`, mermaid's requirements, and how to add a tool. Verify: `openspec validate toolkit-plugin --strict` passes.

## 4. Table copy

- [x] 4.1 Move mermaid's render hook into one reply hook, `hooks/reply.tsx`, that splits a reply into typed blocks (`hooks/blocks.ts`) and draws them in the engine's frame. Verify: the mermaid and cd tests pass unchanged.
- [x] 4.2 Drop the `mermaid` option: the mermaid preview is always on, and `cd` is the only `userConfig` field. Verify: `claude plugin validate plugins/toolkit` passes.
- [x] 4.3 Port the `table-copy` dev mod: `hooks/tables.ts` and a `table` block in the reply hook, with `copy table` through the X11 clipboard script in `hooks/clipboard.ts`, which needs nothing installed. Verify: `claude plugin test plugins/toolkit` passes the parser tests, the button row under each table, each button's copy, the fallback on a non-zero exit and on a failed run, the `table 2` toast, a reply with a table and a drawn diagram that shows both under one bullet, and a terminal with no pictures where the fence stays text and the table keeps its buttons.
- [x] 4.4 Update both READMEs and this change. Verify: `openspec validate --all --strict` passes.

## 5. Release

- [ ] 5.1 Live check: install `toolkit@plugins` in a session in Ghostty and see a mermaid block drawn. In a reply with a table, press `copy table` and paste into Teams or a spreadsheet, then into a plain-text editor. Compare the spacing of a reply with a table against one without. Have the model call `mcp__toolkit__change_session_directory`: `Move` continues in the new folder, `Stay` and typed text keep the session, and a dialog left open past the idle time does not move it. Turn `cd` off in `/plugin` and see the tool go. Archive this change once the user accepts 0.1.0.
