# Tasks

## 1. Move mermaid preview in

- [ ] 1.1 Move `plugins/mermaid-preview/` to `plugins/toolkit/`, the module to `hooks/mermaid.tsx` and its tests to `hooks/mermaid.test.tsx`. Rename the state keys to `mermaidDir`, `mermaidDiagram` and `mermaidIsSource` under `toolkit`. Verify: `git ls-files plugins/mermaid-preview` prints nothing.
- [ ] 1.2 Add `hooks/register.tsx` with the gated `mermaid` line, and the `mermaid` boolean field in `userConfig`. Verify: `claude plugin test plugins/toolkit` passes the ported tests and a test where `mermaid: false` leaves session start and replies to the engine.
- [ ] 1.3 Replace the `mermaid-preview` entry in `.claude-plugin/marketplace.json` with `toolkit`. Verify: `claude plugin validate plugins/toolkit` passes.

## 2. Add the cd tool

- [ ] 2.1 Port the `auto-cd` dev mod to `hooks/cd.ts`, matching `mcp__toolkit__cd`, and add its gated line and the `cd` field. Verify: `claude plugin test plugins/toolkit` passes: a path that is not a directory is denied, a directory runs `/cd <realPath>` and then submits a prompt with the task, and with `cd: false` the tool is not registered.
- [ ] 2.2 Type-check the hooks and the state contract. Verify: `tsc` passes against the bundled `claude-code.d.ts`.

## 3. Docs

- [ ] 3.1 Replace the `mermaid-preview` bullet in `README.md` with `toolkit`, and add `plugins/toolkit/README.md`: each tool, how to turn one off in `/plugin`, mermaid's requirements, and how to add a tool. Verify: `openspec validate toolkit-plugin --strict` passes.

## 4. Release

- [ ] 4.1 Live check: install `toolkit@plugins` in a session in Ghostty, see a mermaid block drawn, have the model call `mcp__toolkit__cd` and continue in the new folder, then turn each tool off in `/plugin` and see it stop. Archive this change once the user accepts 0.1.0.
