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

Exception: a bare name is ambiguous when another enabled plugin ships a skill with the same name. Today `mattpocock-skills` ships `tdd` and `teach`. `renames.sed` namespaces references to those names only (`collisions` section). Checked sources: every plugin in `~/.claude/plugins/cache` (enabled or not), `~/.claude/skills`, project `.claude/skills` in `~/Projects/dev/skills` and `~/Projects/0north/*` (16 skills), and user and project `.claude/commands`. Only `tdd` and `teach` collide. `eval` and `feature` are poteto-mode playbooks, not skills, so they cannot collide. Re-check this list on each upstream bump with:

    comm -12 <(ls plugins/pstack/skills | sort) \
      <(find ~/.claude/plugins/cache -name SKILL.md | awk -F/ '{print $(NF-1)}' | sort -u)

## UserPromptSubmit hook input (D7)

Plugin command hooks get JSON on stdin with `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `hook_event_name`, `prompt`. For a slash command, `prompt` is the raw typed text (`/how`, `/spike:why`), not the expanded skill body. `hookSpecificOutput.additionalContext` reached the model on that same turn, including slash-command turns.
