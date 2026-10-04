# Design

## Context

See proposal.md for the motivation and specs/pstack/spec.md for the required behaviour.

Current state:

- The port's only hook is `scripts/pstack/overlay/hooks/mode-reminder.sh`. On `UserPromptSubmit` it marks a session when the prompt starts with `/poteto-mode` or `/pstack:poteto-mode`, and injects upstream's `reminder:` line into every later prompt in a marked session. On `SessionStart` (`prune`) it drops old markers. It uses `jq` and stays silent without it.
- `<pstack>` already appears in `multi-phase-plan.md` and `check-plan.mjs`. There it is defined as "two directories above the poteto-mode skill's base directory". That definition needs the "Base directory for this skill" header, which only a skill loaded through a slash command or the Skill tool gets. Subagents never see it.
- `scripts/pstack/NOTES.md` (D8) records that bare and bold skill names resolved through the Skill tool in a spike. Those spike skills were not gated. With gating, the listing hides them and the tool refuses them. That is the reason for this change.
- The sticky reminder tells the model to "apply /poteto-mode" on later turns. That is itself a reference to a gated skill, so a later turn re-entering poteto-mode needs the same routing as everything else.

## Goals / Non-Goals

**Goals:**
- Every pstack routing reference works the same way in the main session and in subagents: read the file by path.
- Zero edits to upstream-derived text, so routing survives upstream bumps without new sed rules or patches.

**Non-Goals:**
- Changing which skills are gated. The existing "Every other skill's invocation flags SHALL match upstream" requirement stays.
- Making gated skills callable through the Skill tool.
- Rewriting upstream's slash or bold references.

## Decisions

### D1. Inject routing context from hooks instead of rewriting references

The plugin's hooks tell the model where pstack lives and that its skills are read by path. The skill text stays as upstream wrote it.

Alternatives considered:
- **sed-rewrite model-facing `` `/<gated>` `` references into path reads.** I proposed this in the exploration. It covers only the slash form. Bold references ("the **why** skill") and `poteto-agent`'s "Read the `poteto-mode` skill's `SKILL.md`" have no path either. Every new upstream phrasing needs a new rule, and the result reads worse than upstream.
- **Drop the gate on routed skills (open-pstack's choice).** It breaks our "flags match upstream" requirement. It puts every ungated description into every session's context. It lets `arena`, `swarm`, and `interrogate` fire on their own, which upstream deliberately prevents.
- **A patch to poteto-mode's SKILL.md only.** It fixes the main session but not subagents, and it adds a patch that upstream edits to poteto-mode would keep breaking.

### D2. One script, renamed `pstack-context.sh`, with three modes

`mode-reminder.sh` becomes `pstack-context.sh`:

| mode | event | output |
|---|---|---|
| `prompt` | `UserPromptSubmit` | the routing line on a pstack-invoking turn, and the sticky reminder plus the routing line in a marked session |
| `subagent` | `SubagentStart` | the routing line, always |
| `prune` | `SessionStart` | nothing (unchanged marker cleanup) |

One script keeps the routing text in one place, so the main-session text and the subagent text cannot drift apart. The old name describes only one of the three jobs.

Alternative: a second script next to `mode-reminder.sh`. Rejected because two `UserPromptSubmit` hooks would each inject on the same turn, and the routing text would be duplicated.

### D3. A main-session turn counts as pstack-invoking by its prompt prefix, checked against the installed skills

The routing line is added when the prompt matches `^\s*/(pstack:)?<name>(\s|$)` and `<name>` is a directory under `<pstack>/skills/`. The list comes from the installed plugin at run time, so a new upstream skill is covered with no edit. Marked sessions also get the line on every turn, because the reminder points at `/poteto-mode`, which is gated.

Alternative: inject on `SessionStart` in every session. Rejected because it costs context in sessions that never touch pstack. The spec's "Unrelated main-session turn" scenario forbids it.

### D4. Subagents always get the line, without gating on the parent session

`SubagentStart` injects the line every time. A subagent can come from a marked poteto-mode session, from a direct `/pstack:interrogate` in an unmarked session, or from a playbook several levels deep. Tracking which parent session it came from would need fields in `SubagentStart`'s input that we haven't checked, and it would still miss the direct-invocation case. The cost is one short paragraph per subagent. Projects that don't want it can disable `pstack@skills` per project.

### D5. The subagent path works without `jq`

`SubagentStart` needs JSON output (`hookSpecificOutput.additionalContext`). The `subagent` mode builds it with `printf`, and escapes `\` and `"` in the plugin path with `sed`, so it works on machines without `jq`. The `prompt` mode keeps its existing `jq` requirement, because it has to parse the input JSON, and stays silent without `jq`.

### D6. The injected text

One paragraph, the same in every mode, with `${root}` replaced by the plugin root:

> pstack is installed at `${root}`. In pstack skills, agents, and playbooks, `<pstack>` means that path. pstack skills are user-only slash commands, so the Skill tool refuses them and they are absent from your skill list. When pstack text tells you to use another pstack skill (`/how`, the **why** skill, `` `unslop` ``, and so on), Read `${root}/skills/<name>/SKILL.md` and follow it. Resolve its relative paths against that skill's directory. Do not call the Skill tool for pstack skills, except `setup-pstack`, `deslop`, `control-ui`, and `control-cli`.

The ungated four are named explicitly, so the model doesn't avoid working routes. Either route satisfies the spec's "Ungated skill" scenario.

### D7. Verification uses read-only headless runs, not bypassed permissions

The 2026-10-04 exploration showed that a headless poteto-mode feature run with `bypassPermissions` is blocked by auto mode. When the user ran it without isolation, it committed to the real repository. The tests here instead run `claude -p --plugin-dir <scratch>/plugins/pstack` from a scratch clone, with `--allowedTools` limited to `Read Glob Grep Agent`. They assert on the stream-json tool calls: a `Read` of the target `SKILL.md`, and no `Skill` call naming a gated skill.

## Risks / Trade-offs

- **`SubagentStart` may not deliver `additionalContext`, or may not exist in this Claude Code version.** → Task 1 checks this before anything is built. If it fails, the fallback is a sed rule adding the path line to the two agent files and a sentence in poteto-mode's subagent-spawn rule telling the parent to pass `<pstack>` resolved in each brief. Tasks 2–4 would change to match.
- **The model calls Skill anyway, gets the refusal, and gives up.** → The text says outright not to, and the tests assert no `Skill` call for gated names. If it still happens, try a stronger phrasing before changing the design.
- **About 100 tokens in every subagent in every project where pstack is enabled,** including unrelated work repos. → Accepted. The per-project disable stays the escape hatch, and NOTICE.md documents it.
- **A user skill or another plugin shares a pstack name**, for example `tdd` and `teach` from mattpocock-skills. A prompt `/tdd` would then add pstack routing to a turn that loaded the other plugin's skill. → Harmless: the text only says how to load pstack skills. The prefix check does not skip collision names, because a skip list would duplicate `renames.sed` for no benefit.
- **Renaming the hook script** leaves an installed copy pointing at the old path until reinstall. → `sync.sh` regenerates `hooks.json` and the script together, and the plugin is reinstalled or reloaded as part of every sync.

## Migration Plan

1. Implement in `scripts/pstack/overlay/` and run `scripts/pstack/sync.sh`.
2. Reload the plugin, or start a new session, so the new hooks register.
3. Rollback: revert the overlay change and rerun `sync.sh`. No user state changes. Session markers under `~/.local/state/pstack/mode/` keep their format.
