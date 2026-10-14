# Tasks

## 1. Move the cache section

- [x] 1.1 In `segments()` in `plugins/session-bar/hooks/register.tsx`, push the cache group (`cacheRun`) before the `ctx` meter instead of after it, and update the comment above `cacheRun` if it names its place; verify `tsc` is clean
- [x] 1.2 In `plugins/session-bar/hooks/register.test.ts`, change the terminal cache test's order check to the model's label, ` · `, `cache 38m`, ` · `, then `ctx`, and update its "its own section after ctx" comment; verify `claude plugin test` passes for session-bar

## 2. Live check and release

- [x] 2.1 Load the dev copy via dev-mods hot reload; in a terminal session send a prompt and verify the bar reads `dir (branch) · <model> · cache in use · ctx …` while it streams and `· cache <minutes> ·` right after the model once it ends
- [ ] 2.2 Sync the spec delta into `openspec/specs/session-bar`, bump `plugin.json` to 0.21.0, release (commit, push, `claude plugin update session-bar`); verify a new session shows the cache section right after the model

## Workflow follow-up

- Archive the change after the live check passes.
