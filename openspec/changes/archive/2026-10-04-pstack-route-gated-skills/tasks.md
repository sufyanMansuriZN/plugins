# Tasks

## 1. Confirm the platform hooks

- [x] 1.1 Spike `SubagentStart` with a throwaway plugin in the scratchpad that injects a marker string as `hookSpecificOutput.additionalContext`. Run `claude -p --plugin-dir <spike> --allowedTools "Agent Read" "Spawn a general-purpose subagent that replies with any marker it was given"` and confirm the marker comes back in the result. Record the outcome and the hook's stdin fields in `scripts/pstack/NOTES.md` as D9. If no marker comes back, stop and switch to design.md's fallback before group 2.
- [x] 1.2 In the same spike, confirm that two `additionalContext` values are not needed on one `UserPromptSubmit` turn: a single hook emitting reminder plus routing text reaches the model whole. Add the check to D9.

## 2. Routing context hook

- [x] 2.1 Rename `scripts/pstack/overlay/hooks/mode-reminder.sh` to `pstack-context.sh` with `git mv`. Add a `subagent` mode that prints the design D6 paragraph as `SubagentStart` JSON, built with `printf` and `sed` escaping and no `jq`. Verify with `CLAUDE_PLUGIN_ROOT='/tmp/a "b"' scripts/pstack/overlay/hooks/pstack-context.sh subagent | jq -e .hookSpecificOutput.additionalContext`.
- [x] 2.2 Extend the `prompt` mode. Inject the D6 paragraph when the prompt matches `^\s*/(pstack:)?<name>(\s|$)` and `<name>` is a directory under `$root/skills`. In a marked session, inject the reminder line followed by the paragraph. Keep marker creation and `prune` as they are. Verify by piping sample JSON for `/how x`, `/pstack:interrogate`, `/tdd`, `hello` (unmarked), and `hello` (marked) and checking the expected output for each, with nothing for unmarked `hello`.
- [x] 2.3 Add `scripts/pstack/test-context.sh`, which runs the checks from 2.1 and 2.2 against a temporary `XDG_STATE_HOME` and exits non-zero on any mismatch. Verify it passes, then breaks when the routing paragraph is emptied.
- [x] 2.4 Update `scripts/pstack/overlay/hooks/hooks.json`: `UserPromptSubmit` runs `pstack-context.sh prompt`, `SubagentStart` runs `pstack-context.sh subagent`, and `SessionStart` runs `pstack-context.sh prune`. Verify with `jq . hooks.json` and by checking that no other file in `scripts/pstack/` still names `mode-reminder.sh` (`grep -r mode-reminder scripts/pstack` is empty).

## 3. Regenerate and document

- [x] 3.1 Add a "Skill routing" bullet to `scripts/pstack/overlay/NOTICE.md`. It should say that pstack skills stay gated as upstream intends, that a hook tells Claude and every subagent the plugin path so skills are read by path, and that the per-subagent context cost applies wherever the plugin is enabled. Verify that the bullet appears in the regenerated `plugins/pstack/NOTICE.md` after 3.2.
- [x] 3.2 Run `scripts/pstack/sync.sh` and verify it finishes with lint clean. `git diff --stat plugins/pstack` should show only `hooks/`, `NOTICE.md`, and no skill or agent files.
- [x] 3.3 Run `scripts/pstack/test-context.sh` against the regenerated `plugins/pstack/hooks/pstack-context.sh`, and verify that it passes.

## 4. Headless routing checks

Run each check from a scratch clone (`git clone` of this repo into the scratchpad), using `claude -p --plugin-dir <clone>/plugins/pstack --output-format stream-json --verbose --allowedTools "Read Glob Grep Agent"`. Each check asserts on tool calls in the stream: a `Read` of the target `SKILL.md`, and no `Skill` call naming a gated pstack skill.

- [x] 4.1 A subagent with a slash reference. Prompt: spawn a `pstack:poteto-agent` told to review a two-line diff in the clone and "run `/no-comments` before review". Verify that the subagent reads `plugins/pstack/skills/no-comments/SKILL.md` and makes no `Skill` call for `no-comments`.
- [x] 4.2 An agent definition with a gated skill. Prompt: spawn `pstack:comment-sicko` on a file with an `IMPORTANT: do not remove` comment whose claim needs `/why`. Verify that it reads `skills/why/SKILL.md`, or `skills/how/SKILL.md`, and makes no gated `Skill` call.
- [x] 4.3 Main-session routing. Prompt: `/pstack:poteto-mode explain how scripts/pstack/sync.sh stages work; investigation only, change nothing`. Verify a `Read` of `skills/how/SKILL.md` or the investigation playbook, and no gated `Skill` call. The `--allowedTools` limit keeps the clone unchanged, which `git -C <clone> status --short` confirms is empty.
- [x] 4.4 Update the "Cross-skill references resolve" note in `scripts/pstack/NOTES.md` (D8). It should say that the Skill-tool resolution it records applies only to ungated skills, and point to D9 and to these checks. Verify that the note names both D8 and D9.
