# Port notes

Findings from spikes run 2026-10-03 against Claude Code 2.1.288 (`claude -p --plugin-dir`, haiku).

## Bare skill names resolve to the plugin skill (D8)

A throwaway plugin `spike` shipped skills `how` and `why`. All four probes loaded `spike:how`:

| prompt | result |
|---|---|
| `/how` | loaded `spike:how` |
| `/spike:how` | loaded `spike:how` |
| `Use the **how** skill now.` | `Skill {"skill": "spike:how"}` |
| `/spike:why` whose body says "load the **how** skill" | `Skill {"skill": "spike:how"}` |

So upstream's bare references (`/how`, "the **why** skill") work unchanged. There is no blanket `/<name>` to `/pstack:<name>` rewrite.

The spike skills were not gated, so the Skill-tool resolution above applies only to ungated skills (`setup-pstack`, `deslop`, `control-ui`, `control-cli`). Gated skills are reached by reading their `SKILL.md`, as described in D9 and covered by the headless checks in the `pstack-route-gated-skills` change.

Exception: a bare name is ambiguous when another enabled plugin ships a skill with the same name. Today `mattpocock-skills` ships `tdd` and `teach`. `renames.sed` namespaces references to those names only (`collisions` section). Checked sources: every plugin in `~/.claude/plugins/cache` (enabled or not), `~/.claude/skills`, project `.claude/skills` in `~/Projects/dev/skills` and `~/Projects/0north/*` (16 skills), and user and project `.claude/commands`. Only `tdd` and `teach` collide. `eval` and `feature` are poteto-mode playbooks, not skills, so they cannot collide. Re-check this list on each upstream bump with:

    comm -12 <(ls plugins/pstack/skills | sort) \
      <(find ~/.claude/plugins/cache -name SKILL.md | awk -F/ '{print $(NF-1)}' | sort -u)

## UserPromptSubmit hook input (D7)

Plugin command hooks get JSON on stdin with `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `hook_event_name`, `prompt`. For a slash command, `prompt` is the raw typed text (`/how`, `/spike:why`), not the expanded skill body. `hookSpecificOutput.additionalContext` reached the model on that same turn, including slash-command turns.

## SubagentStart context and gated skills (D9)

Spike run 2026-10-04 against Claude Code 2.1.289 (`claude -p --plugin-dir`, sonnet parent, haiku subagent).

- A plugin `SubagentStart` command hook that prints `{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":...}}` reaches the subagent's context. A `general-purpose` subagent echoed the marker back.
- `SubagentStart` stdin has `session_id`, `transcript_path`, `cwd`, `prompt_id`, `agent_id`, `agent_type`, `hook_event_name`. It has no prompt text.
- One `UserPromptSubmit` hook that emits two sentences in a single `additionalContext` delivers both to the model.

D8's Skill-tool resolution holds only for ungated skills. A skill with `disable-model-invocation: true` is missing from the Skill tool listing, and a direct `Skill` call is refused with "Do not replicate this skill's workflow by other means". So the plugin's `pstack-context.sh` gives the main session (on pstack turns) and every subagent the plugin path, and tells the model to read `<pstack>/skills/<name>/SKILL.md`.
