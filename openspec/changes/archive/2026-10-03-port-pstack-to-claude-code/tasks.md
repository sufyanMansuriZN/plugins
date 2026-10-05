# Tasks

## 1. Spikes

- [x] 1.1 In a throwaway plugin with skills `how` and `why`, check whether a bare `/how` in a prompt, and the phrase "use the **how** skill", load `<plugin>:how`. Record the outcome and the chosen D8 path in `scripts/pstack/NOTES.md`. Verify: the transcript shows which skill loaded in each case
- [x] 1.2 Confirm a plugin `UserPromptSubmit` command hook receives `session_id` and `prompt` on stdin, and that its `additionalContext` reaches the model when the prompt is a slash command. Verify: a throwaway hook that echoes a marker string is visible to Claude on the next turn

## 2. Sync skeleton

- [x] 2.1 Create `scripts/pstack/UPSTREAM` (SHA `23e4138…` full hash, upstream version `0.15.6`, port revision `1`) and `sync.sh`. `sync.sh` fetches the pinned SHA anonymously into a temp dir, copies `pstack/{skills,agents,LICENSE}` plus `cursor-team-kit/skills/{deslop,control-ui,control-cli}`, and swaps the result into `plugins/pstack/` via `rsync --delete` only on success. Verify: `plugins/pstack/` contains no `automations/`, `docs/`, `.cursor-plugin/`, or `skills/make-bot-ui/`, and the 3 vendored skill files exist
- [x] 2.2 Add the overlay: `.claude-plugin/plugin.json.in` (name `pstack`, version filled as `<upstream>-cc.<n>`, MIT, author credit to upstream) and `NOTICE.md` (attribution, upstream SHA, the panel-convergence caveat, the bump checklist, how to undo `/setup-pstack`). Verify: generated `plugin.json` has version `0.15.6-cc.1` and `claude plugin validate plugins/pstack` passes, or the equivalent manifest check if that command is unavailable
- [x] 2.3 Run `sync.sh` twice and diff the outputs. Verify: no differences (reproducible build)

## 3. Mechanical renames (sed)

- [x] 3.1 Write `renames.sed` covering tool names (Task→Agent, AskQuestion→AskUserQuestion, todo list→TodoWrite), model family regexes→tiers, `create-skill`→`skill-creator`, `Cursor restart`→`session restart`, and the cursor-team-kit deslop/control-* references. Verify: `grep -rnE 'grok-|gpt-[0-9]|AskQuestion\b|Task tool' plugins/pstack` returns nothing outside the allowlisted files
- [x] 3.2 If spike 1.1 showed bare names do not resolve, add the generated `/<skill>`→`/pstack:<skill>` word-boundary rule, built from the skill directory list. Verify: `grep -rn '/how\b' plugins/pstack` shows only namespaced forms, and `/pstack:poteto-mode` text is unchanged by double application Outcome: bare names resolve, so only names that collide with another enabled plugin (`tdd`, `teach`) are namespaced; see `scripts/pstack/NOTES.md`.

## 4. Semantic patches

- [x] 4.1 Patch `agents/poteto-agent.md` and `agents/comment-sicko.md`: drop `is_background`, set kebab-case `name`. Verify: both agent types are listed after plugin install (checked in 7.1) and the frontmatter parses
- [x] 4.2 Patch `poteto-mode/SKILL.md`: subagent defaults use the Agent tool with `model` per role and the default tiers, drop "not Cursor's built-in babysit", keep `disable-model-invocation: true` and the `reminder:` line verbatim. Verify: `git apply --check` passes and grep shows the reminder line unchanged
- [x] 4.3 Patch `setup-pstack/SKILL.md`: write `~/.claude/pstack-models.md` (values `opus|sonnet|haiku|fable|inherit`, panel roles as lists), add a single `@pstack-models.md` import to `~/.claude/CLAUDE.md` (create it if missing, never duplicate), use the D5 budget→tier table, and drop the Cursor rules path and effort suffixes. Verify: lint is clean for the file and the role list matches the spec's defaults
- [x] 4.4 Patch the model-family rules ("different family", `claude-*/gpt-*/grok-*` prefixes) to "different tier" in arena, interrogate, orchestrate, eval, perf-issue, why, swarm, show-me-your-work, reflect, feature, and how. Verify: `grep -rni 'family' plugins/pstack/skills` shows no vendor-family logic
- [x] 4.5 Patch seat stances into `architect/references/runner-prompt.md`, arena's runner section, and `interrogate/references/reviewer-prompt.md`, keyed by seat with no stance for the cross-judge. Verify: each file names three distinct stances that match specs/pstack, and the cross-judge prompt has none
- [x] 4.6 Patch transcript paths in recall, session-pickup, eval, show-me-your-work, reflect references, and `poteto-mode/scripts/worktree-audit.sh` to `~/.claude/projects/<slug>/<session-id>.jsonl` with the non-alphanumeric→`-` slug. Verify: running `worktree-audit.sh` in this repo exits 0 and reads `~/.claude/projects/-home-me-Projects-plugins/*.jsonl`
- [x] 4.7 Patch cloud usage in orchestrate, autopilot-stack, shipping, and worktree-cleanup (`environment: "cloud"`, "Cursor cloud", `~/.cursor/worktrees`) to local `isolation: "worktree"` with `run_in_background: true`, and cut cloud-only steps. Verify: `grep -rnE 'cloud' plugins/pstack/skills` shows no instruction that requires cloud execution
- [x] 4.8 Patch any remaining `.cursor/` references (automate-me skills dir, reflect plugin dirs) to their Claude Code equivalents (`~/.claude/skills/`, `~/.claude/plugins/`). Verify: covered by the lint in 5.1 Outcome: done by the `.cursor/skills/` and `.cursor/plugins/` rules in `renames.sed`; transcript `~/.cursor/projects` paths are in the 4.6 patches.
- [x] 4.9 Make `sync.sh` run `git apply --check` per patch and fail with the patch filename. Then point UPSTREAM at an older SHA where poteto-mode differs and rerun. Verify: exit is non-zero, the failing patch is named, and `git status plugins/pstack` is clean

## 5. Residue lint

- [x] 5.1 Add the D4 lint stage and `lint-allow.txt`, with the allowlist holding NOTICE.md and LICENSE only. Verify: a clean sync passes, and injecting `~/.cursor/rules` into a temp copy of a skill fails with file, line, and token printed

## 6. Sticky mode hook

- [x] 6.1 Add `overlay/hooks/hooks.json` and `mode-reminder.sh` per D7 (prefix match on `/pstack:poteto-mode` or `/poteto-mode`, per-session marker under `${XDG_STATE_HOME:-~/.local/state}/pstack/mode/`, reminder read from SKILL.md frontmatter at run time, SessionStart prune of markers older than 7 days). Verify: piping sample JSON shows no output for a fresh session id, output after a `/pstack:poteto-mode` prompt for that id, and no output for a different id

## 7. Marketplace and integration checks

- [x] 7.1 Add the `pstack` entry to `.claude-plugin/marketplace.json`, then install `pstack@skills`. Verify: `/pstack:poteto-mode` and `/pstack:setup-pstack` appear in the skill list and the `poteto-agent` and `comment-sicko` agent types are available Outcome: agents register as `pstack:poteto-agent` and `pstack:comment-sicko`; a bare `subagent_type: "comment-sicko"` request was spawned as `pstack:comment-sicko`.
- [x] 7.2 In a fresh session, describe a feature without the slash command. Verify: poteto-mode is not loaded and no reminder appears. Then run `/pstack:poteto-mode`, send a second prompt, and verify the reminder is in context. Start a new session and verify it is gone
- [x] 7.3 Run `/pstack:setup-pstack` with `HOME` pointed at a scratch dir, twice, with defaults and then with `small`. Verify: `pstack-models.md` matches the spec defaults and the small-budget table, `CLAUDE.md` holds exactly one import, and other content is preserved Outcome: run 1 wrote the defaults and created `CLAUDE.md` holding only the import; the small-budget run rewrote the role lines and left the single import and other content alone. A headless re-run needs `bypassPermissions`, because Claude Code treats overwriting a file under `.claude/` as a sensitive edit; in an interactive session the user approves it.
- [x] 7.4 Run `/pstack:interrogate` on a small diff. Verify: three reviewers spawn on `opus`, `fable`, and `sonnet`, each with its stance (check the Agent call parameters in the transcript)
- [x] 7.5 Run `/pstack:recall` for a known earlier session in this repo. Verify: it finds the session from `~/.claude/projects`
