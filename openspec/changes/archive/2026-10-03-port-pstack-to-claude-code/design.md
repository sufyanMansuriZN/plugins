# Design

## Context

See proposal.md for the motivation and specs/ for the requirements.

- Upstream is `cursor/plugins` (public, MIT). pstack lives at `pstack/` and the three skills it borrows live at `cursor-team-kit/skills/`. `gh` auth is broken on this machine, so the sync clones over anonymous HTTPS.
- Upstream content is mostly Markdown: about 120 files, 43 of which mention Cursor-specific things. The few scripts are `poteto-mode/scripts/worktree-audit.sh`, `orch/*.ts`, `watch-pr/*`, and `check-plan.mjs`.
- This repo already ships `session-bar` through `.claude-plugin/marketplace.json`. It has no `scripts/` directory yet.
- Claude Code facts the design relies on:
  - Plugin skills are namespaced (`pstack:<skill>`).
  - `disable-model-invocation` is honored.
  - Agent frontmatter supports `name/description/model/tools`.
  - The Agent tool's `model` accepts `opus|sonnet|haiku|fable` or a full ID. When it is omitted, the agent's frontmatter model applies, then the parent model.
  - The Agent tool also accepts `run_in_background` and `isolation: "worktree"`.
  - Command hooks in a plugin's `hooks/hooks.json` receive `session_id` and `prompt` as JSON on stdin.
  - Transcripts live at `~/.claude/projects/<slug>/<session-id>.jsonl`. The slug replaces every non-alphanumeric character with `-`, as verified on this machine.

## Goals / Non-Goals

**Goals:**
- One command (`scripts/pstack/sync.sh`) rebuilds `plugins/pstack/` from the pinned SHA, with no hand edits under `plugins/pstack/`.
- Upstream drift shows up as a failed patch or a failed lint, never as a silently wrong skill.
- Keep the diff against upstream as small as possible, so re-syncs stay cheap.

**Non-Goals:**
- Rewriting pstack's prose or playbooks beyond what Claude Code compatibility needs.
- Automating the SHA bump (no CI and no scheduled job). Bumping is a manual edit followed by a rerun.
- Supporting Cursor from the generated tree.

## Decisions

### D1. Layout: sources under `scripts/pstack/`, output under `plugins/pstack/`
```
scripts/pstack/
  sync.sh            entry point
  UPSTREAM           pinned SHA + upstream version + port revision n
  renames.sed        mechanical renames (stage 2)
  patches/*.patch    semantic edits, one per upstream file or concern (stage 3)
  overlay/           files we own, copied verbatim (stage 4)
    .claude-plugin/plugin.json.in   version placeholder filled from UPSTREAM
    hooks/hooks.json
    hooks/mode-reminder.sh
    NOTICE.md        attribution + upstream SHA
  lint-allow.txt     residue-lint allowlist (stage 5)
plugins/pstack/      generated, committed
```
Keeping the sources apart from the output keeps the generated tree free of edits made directly in it. *Alternative:* a fork branch rebased on upstream. Rejected because rebasing 43 files of prose by hand every bump is the cost this change exists to avoid.

### D2. Build into a temp dir, swap in only when every stage passes
`sync.sh` steps:
1. Shallow-fetch the pinned SHA into a temp clone.
2. Copy the selected paths into `$TMP/out`.
3. Run sed.
4. Run `git apply --directory=` for each patch, using `git apply --check` first and printing the patch name on failure.
5. Copy the overlay and fill in the version.
6. Lint.
7. `rsync --delete` into `plugins/pstack/`.

If any stage fails, the script exits non-zero and leaves `plugins/pstack/` untouched. This satisfies "no partial plugin". *Alternative:* transform in place and rely on `git checkout` to recover. Rejected because a failed run would leave a dirty tree to clean up by hand.

### D3. Two transform layers: sed for vocabulary, patches for meaning
- **sed** handles one-to-one token renames that are safe anywhere:
  - `Task tool` → `Agent tool`
  - `AskQuestion` → `AskUserQuestion`
  - `claude-opus-5-5-max` → `opus`
  - `gpt-5.6-sol-max` → `fable`
  - `grok-4.7-xhigh-fast` → `sonnet`
  - `create-skill` → `skill-creator`
  - `Cursor restart` → `session restart`
  - `the deslop skill from the cursor-team-kit plugin` → `the deslop skill`
  - and similar.

  Model slugs are matched by family regex (`claude-opus-[0-9.-]+(-max)?`, `gpt-[0-9.]+-[a-z]+(-max)?`, `grok-[0-9.]+-[a-z-]+`), so an upstream model bump keeps mapping without editing the table.
- **patches** handle anything that changes meaning:
  - setup-pstack (rewritten to write `~/.claude/pstack-models.md`, with budget→tier)
  - the "different model family" rules → "different tier" (arena, interrogate, architect, plus the 14-file list from exploration)
  - seat stances in `architect/references/runner-prompt.md`, `interrogate/references/reviewer-prompt.md`, and arena's runner section
  - transcript paths (recall, session-pickup, eval, show-me-your-work, reflect, `worktree-audit.sh`)
  - cloud → `isolation: "worktree"` (orchestrate, autopilot-stack, shipping)
  - poteto-mode's subagent defaults and its "not Cursor's built-in babysit" clause
  - agent frontmatter: drop `is_background`, set `name: comment-sicko`

  *Alternative:* sed-only. Rejected because sed rewrites drift silently, so a changed upstream paragraph would yield nonsense with exit 0. A patch with surrounding context lines refuses to apply when upstream changes the paragraph, and that refusal is the loud failure the spec requires.

Patches are authored against the post-sed tree. That way they see the Claude vocabulary, and sed changes don't break their context lines.

### D4. Residue lint is a grep with an allowlist
`grep -rnEo` over `$TMP/out` for model slugs (`grok-`, `gpt-N-`), `.cursor` paths, the word `Cursor` (case-sensitive), `cursor-team-kit`, Cursor tool and field names (`AskQuestion`, `` `Task` ``, `Task tool|subagent|schema`, `environment: "cloud"|"local"`, `readonly: true|false`, `generalPurpose`, `todolist`, `inherit-parent`) and `pstack-models.mdc`. Each `file:line:token` hit outside `lint-allow.txt` fails the run. The allowlist holds NOTICE.md and `LICENSE` only. Bare `Cursor` is linted because every remaining mention turned out to be actionable. Matching is case-sensitive so that GitHub API identifiers in watch-pr (`endCursor`, `author === "cursor"`) pass. A second check fails on any skill or agent `name:` that is not kebab-case.

### D5. Model roles: defaults live in skills, overrides live in user memory
Each skill states its default tier inline, after sed and patches, and also says "unless `~/.claude/pstack-models.md` sets this role". `/setup-pstack` writes that file and appends `@pstack-models.md` to `~/.claude/CLAUDE.md` only if no line matching `^@pstack-models\.md$` exists. Claude then sees the overrides in every session through memory.

*Alternatives considered:*
- A SessionStart hook that injects the config. Rejected because it adds hook machinery for something memory imports already do.
- `AGENTS.md`. Rejected because Claude only reads it when there is no CLAUDE.md, and only per project.
- Agent frontmatter `model:`. Rejected because it is fixed per agent type, and pstack picks the model per role at call time.

Budget → tier, given the lack of a per-call effort knob:

| budget | judgment roles | fast roles | panels |
|---|---|---|---|
| unlimited / large | opus | sonnet | opus, fable, sonnet |
| medium | sonnet | sonnet | opus, fable, sonnet |
| small | sonnet | haiku | sonnet, fable, haiku |

### D6. Panels: tier diversity plus stances
Upstream's panels rely on different vendors having different blind spots. Claude tiers share a lineage, so each default seat also gets a stance that pushes it toward a different region of the design or review space (stance text is in specs/pstack). Stances are keyed to the seat, not the tier. If a user puts `opus, opus, opus` in their config, the three seats still receive the three stances. The cross-judge gets no stance and prefers a tier other than the parent's. This preserves upstream's "judge from another family" intent.

### D7. Sticky poteto-mode via a UserPromptSubmit hook with per-session state
`hooks/mode-reminder.sh` reads stdin JSON (`session_id`, `prompt`):
- If `prompt` starts with `/pstack:poteto-mode` or `/poteto-mode`, the script touches `${XDG_STATE_HOME:-$HOME/.local/state}/pstack/mode/<session_id>`.
- If that file exists, the script prints upstream's `reminder:` line as `additionalContext`.
- The reminder text is read at run time from `${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/SKILL.md` frontmatter, so upstream rewording flows through automatically.
- A SessionStart hook deletes marker files older than 7 days.

The skill keeps `disable-model-invocation: true`, so invocation can only come from the user's prompt, and the prompt prefix is a sufficient signal.

*Alternative:* a PostToolUse hook on `Skill`. Rejected because a user-typed slash command does not pass through the Skill tool, so that hook would never fire. *Alternative:* no stickiness. Rejected because upstream made the mode sticky deliberately (0dda29e), and the user liked always-on.

The state lives outside the repo and the plugin dir, so plugin updates don't wipe it.

### D8. Bare `/how` vs `pstack:how` is resolved by a spike, then one of two paths
Upstream says "the **how** skill" and `/how` everywhere. Task 1 checks in a real session whether Claude resolves a bare name to the namespaced plugin skill.
- If it does, no transform is needed.
- If not, a sed rule with word boundaries rewrites `/<name>` to `/pstack:<name>`, using the list of skill directory names generated at sync time. That way new upstream skills are covered.

Either way the task breakdown stays the same: the sed stage already exists.

### D9. Cloud → worktree is a prose rewrite, not an emulation
Each "Cursor cloud agent" or `environment: "cloud"` becomes `isolation: "worktree"` with `run_in_background: true`. Steps that only matter in the cloud (picking cloud repos, cloud PR handoff) are cut in the patch. Org policy disables remote sessions, so no fallback is offered.

## Risks / Trade-offs

- [Same-lineage panels converge more than cross-vendor ones] → seat stances (D6). This is accepted as a known quality reduction, called out in NOTICE.md.
- [The sed family regex mis-maps a future model name, e.g. a new `gpt-*` coding model that upstream now uses for code] → sed maps family to tier without regard to role. Patches own every role line in setup-pstack and poteto-mode, so a role reassignment upstream breaks a patch loudly.
- [Patch churn: frequent upstream edits to poteto-mode/setup-pstack mean frequent patch refreshes] → one patch per file keeps refreshes local. `sync.sh --refresh <patch>` regenerates a patch from a hand-fixed temp tree.
- [The hook prefix check misses an invocation typed mid-prompt] → this matches how slash commands work (the command must lead the prompt). Accepted.
- [Lint false negatives: a Cursor reference phrased in a new way] → the lint is a backstop, not a proof. Each sync's `git diff plugins/pstack` gets a human skim, and that step is in the bump checklist.
- [The worktree-audit/transcript path patch is wrong for some slug] → verified against the real `~/.claude/projects` on this machine (tasks), using the same slug rule Claude applies.

## Migration Plan

This change adds a plugin and has no existing users to migrate.
- Rollback: remove the marketplace entry, or disable `pstack@skills`.
- `~/.claude/pstack-models.md` and the import line exist only if the user ran `/setup-pstack`. Removing them is manual and is documented in NOTICE.md.

## Open Questions

- Whether `NOTICE.md` or a `README.md` is the better home for the bump checklist. Either way, it does not affect the specs or the tasks.
