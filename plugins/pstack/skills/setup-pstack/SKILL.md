---
name: setup-pstack
description: Configure which Claude model tier pstack uses per role and at what budget. Writes ~/.claude/pstack-models.md and imports it from ~/.claude/CLAUDE.md so it overrides the skill defaults in every session. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.claude/pstack-models.md`, which sets pstack's model per role, and import it from `~/.claude/CLAUDE.md` so every session reads it.

## Steps

### 1. Valid values

A role value is a tier alias the `Agent` tool accepts for `model`: `opus`, `sonnet`, `haiku`, or `fable`. It can also be `inherit`, which means the role runs on the parent chat model (omit Agent `model`). `auto` is accepted as a synonym for `inherit`. Nothing needs detecting. Never write any other value.

### 2. Load current state

The default role-to-model mapping is the file shape shown in step 5 below. If `~/.claude/pstack-models.md` already exists, read it and treat its `budget:` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer AskUserQuestion over free text. Offer these four options with these exact labels, and name the current budget when the file records one.

- `unlimited — defaults`
- `large — defaults`
- `medium — judgment on sonnet`
- `small — judgment on sonnet, fast work on haiku`

**(b) Apply it.** Claude Code has no per-subagent reasoning effort, so the budget picks tiers. Build the working table from the step 5 defaults, and on a re-run keep any role the user changed by hand.

| budget | single-model roles now on `opus` | single-model roles now on `sonnet` | panel lists |
|---|---|---|---|
| unlimited, large | `opus` | `sonnet` | `opus, fable, sonnet` |
| medium | `sonnet` | `sonnet` | `opus, fable, sonnet` |
| small | `sonnet` | `haiku` | `sonnet, fable, haiku` |

`fable` and `inherit` values do not change. Panels keep three distinct tiers at every budget, because their seats exist to disagree.

**(c) Show the roles and confirm.** Show every role with its value, and list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering `opus`, `sonnet`, `haiku`, `fable`, and `inherit` as the options. Prefer AskUserQuestion over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, `inherit` entries included, so the list length sets the count. Seat stances follow list position, not tier. `arena cross-judge pool` is also a list, but Arena selects one value from it whose tier differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every value written must be one of `opus`, `sonnet`, `haiku`, `fable`, `inherit`, or `auto`. If a chosen value is anything else, stop and ask again.

### 5. Write the file and the import

Write `~/.claude/pstack-models.md` with a `budget:` line and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape:

```
# pstack model configuration

pstack skills read these role lines when choosing the `model` for each `Agent` call. One line per role. Delete a line to fall back to the skill default. `inherit` (or `auto`) runs the role on the parent chat model (omit Agent `model`). `inherit` entries in a panel list still count toward its fan-out.

budget: unlimited
feature, refactoring: sonnet
bug-fix: sonnet
perf-issue: sonnet
hillclimb: sonnet
judgment and prose: opus
hardest tasks: opus
how explorer: sonnet
how explainer: opus
why investigators: sonnet
why synthesizer: opus
reflect tooling: fable
reflect judgment, divergent, synthesizer: opus
arena runners: opus, fable, sonnet
arena cross-judge pool: opus, fable, sonnet
swarm workers: sonnet
architect runners: opus, fable, sonnet
interrogate reviewers: opus, fable, sonnet
```

Then make sure `~/.claude/CLAUDE.md` imports it exactly once. If the file does not exist, create it containing only the line `@pstack-models.md`. If it exists and no line is exactly `@pstack-models.md` or `@~/.claude/pstack-models.md`, append `@pstack-models.md` on its own line, preceded by a blank line. Otherwise leave it alone. Never rewrite or reorder the rest of `~/.claude/CLAUDE.md`.

### 6. Confirm

Tell the user the file was written, whether the import was added or already present, and that it applies to new sessions. Re-running this skill updates it. To undo, delete `~/.claude/pstack-models.md` and the import line.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
