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

## 4. Release

- [ ] 4.1 Live check: install `toolkit@plugins` in a session in Ghostty and see a mermaid block drawn. Have the model call `mcp__toolkit__change_session_directory`: `Move` continues in the new folder, `Stay` and typed text keep the session, and a dialog left open past the idle time does not move it. Turn each tool off in `/plugin` and see it stop. Archive this change once the user accepts 0.1.0.
