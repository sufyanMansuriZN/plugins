# Spec Delta

## Purpose

pstack's rigorous agent workflows (the poteto-mode router, playbooks, principles, and multi-model panels), running in Claude Code with Claude-only models and local execution.

## ADDED Requirements

### Requirement: Installable from the local marketplace
pstack SHALL be listed in this repository's marketplace and SHALL install as a Claude Code plugin named `pstack`. Its skills and agents SHALL then be available in sessions.

#### Scenario: Install
- **WHEN** the user installs `pstack@skills`
- **THEN** `/pstack:poteto-mode`, `/pstack:setup-pstack`, and the other pstack skills appear in the skill listing, and the `poteto-agent` and `comment-sicko` agent types are available

### Requirement: Claude Code tool vocabulary
Skill and agent instructions SHALL name Claude Code's tools and fields: `Agent` (not `Task`), `AskUserQuestion` (not `AskQuestion`), and the todo tool. A role set to inherit SHALL leave the Agent call's `model` unset.

#### Scenario: Spawning a subagent
- **WHEN** a playbook step delegates work
- **THEN** the instruction tells Claude to call the `Agent` tool with `subagent_type`, `model`, and `run_in_background`

### Requirement: Default model per role
Each role SHALL default to a Claude tier that matches the job upstream gave it. Fast, high-volume roles use `sonnet`: code delegates, how explorer, why investigators, swarm workers. Judgment roles use `opus`: judgment and prose, hardest tasks, explainers, synthesizers. Reflect tooling uses `fable`.

#### Scenario: Feature delegate with no configuration
- **WHEN** no model configuration exists and the Feature playbook delegates code
- **THEN** the subagent is spawned with `model: "sonnet"`

#### Scenario: Hardest change
- **WHEN** a delegated change is cross-cutting design, gnarly concurrency, or a subtle algorithm
- **THEN** the subagent is spawned with `model: "opus"`

### Requirement: Panels use distinct tiers
Panel roles (arena runners, architect runners, interrogate reviewers, arena cross-judge pool) SHALL default to one seat each on `opus`, `fable`, and `sonnet`. Instructions that require a different model family SHALL require a different tier instead.

#### Scenario: Default interrogate panel
- **WHEN** `/interrogate` runs with no configuration
- **THEN** three reviewers are spawned, on `opus`, `fable`, and `sonnet`

#### Scenario: Cross-judge selection
- **WHEN** arena picks a cross-judge and the parent chat runs on `opus`
- **THEN** the judge runs on a tier other than `opus`

### Requirement: Panel seats take distinct stances
Each default panel seat SHALL receive a distinct stance in its prompt. Design panels (arena, architect): `opus` designs the end state, `fable` designs the smallest working thing, `sonnet` designs the most conventional fit to existing patterns. Review panels (interrogate): `opus` hunts correctness, `fable` hunts premise and abstraction, `sonnet` hunts reader load and weak tests. Every seat still reports any finding.

#### Scenario: Architect runners
- **WHEN** `/architect` fans out its default runners
- **THEN** each runner prompt carries a different stance, and the cross-judge prompt carries none

### Requirement: Model configuration
`/setup-pstack` SHALL write the per-role choices to `~/.claude/pstack-models.md`. It SHALL ensure `~/.claude/CLAUDE.md` imports that file exactly once. Each role value is `opus`, `sonnet`, `haiku`, `fable`, or `inherit`. A panel role takes a list of these values. A role without a line keeps its default.

#### Scenario: First run
- **WHEN** the user runs `/setup-pstack` and accepts the defaults with no existing `~/.claude/CLAUDE.md`
- **THEN** `~/.claude/pstack-models.md` holds one line per role, and `~/.claude/CLAUDE.md` exists containing a single `@pstack-models.md` import

#### Scenario: Re-run
- **WHEN** `/setup-pstack` runs again with an import already present
- **THEN** it overwrites `~/.claude/pstack-models.md`, leaves the rest of `~/.claude/CLAUDE.md` untouched, and does not add a second import

#### Scenario: Override honored
- **WHEN** the configuration sets `bug-fix: opus`
- **THEN** the Bug fix playbook spawns its code delegate with `model: "opus"`

### Requirement: Budget chooses a tier
The `/setup-pstack` budget question SHALL lower the tiers rather than reasoning effort. `unlimited` and `large` keep the defaults. `medium` moves `opus` roles to `sonnet` outside panels. `small` also moves `sonnet` roles to `haiku`. Panels keep three distinct tiers at every budget.

#### Scenario: Small budget
- **WHEN** the user picks `small`
- **THEN** judgment roles become `sonnet`, fast roles become `haiku`, and each panel still lists three different tiers

### Requirement: poteto-mode is user-invoked
`/pstack:poteto-mode` SHALL keep upstream's `disable-model-invocation: true`, so Claude never loads it on its own. Every other skill's invocation flags SHALL match upstream.

#### Scenario: Claude does not self-invoke
- **WHEN** the user describes a feature without typing `/pstack:poteto-mode`
- **THEN** Claude does not load the poteto-mode skill through the Skill tool

### Requirement: Sticky mode reminder
After the user invokes `/pstack:poteto-mode` in a session, every later prompt in that session SHALL carry upstream's reminder line. Sessions where it was never invoked SHALL carry no reminder.

#### Scenario: Activated session
- **WHEN** the user invokes `/pstack:poteto-mode` and then sends another prompt
- **THEN** that prompt's context includes "New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't."

#### Scenario: Fresh session
- **WHEN** a new session starts and the user has not invoked poteto-mode
- **THEN** no pstack reminder is injected

#### Scenario: Plugin disabled for a project
- **WHEN** a project's settings set `pstack@skills` to disabled
- **THEN** no pstack skills, agents, or reminders load in that project

### Requirement: Local worktree isolation instead of cloud
Every instruction that upstream sends to a Cursor cloud agent SHALL instead run the agent locally in an isolated git worktree. No instruction SHALL require cloud execution.

#### Scenario: Orchestrate worker
- **WHEN** the Orchestrate playbook spawns a worker
- **THEN** the instruction calls for `isolation: "worktree"`, and no instruction mentions `environment: "cloud"`

### Requirement: Claude Code transcript lookup
Skills that read past sessions (recall, session-pickup, eval, worktree-audit) SHALL find transcripts at `~/.claude/projects/<slug>/<session-id>.jsonl`. `<slug>` is the absolute workspace path with every character that is not a letter or digit replaced by `-`, so `/` and `.` both become `-` and the leading `-` stays.

#### Scenario: Recall in this repository
- **WHEN** `/recall` runs in `~/Projects/plugins`
- **THEN** it searches `~/.claude/projects/-home-me-Projects-plugins/*.jsonl`

#### Scenario: Worktree audit
- **WHEN** `worktree-audit.sh` runs on a machine with Claude Code transcripts
- **THEN** it reads them without error and reports worktrees as it does upstream

### Requirement: Cross-skill references resolve
Whenever a pstack skill or agent tells Claude to use another pstack skill by name (for example `/how`, the **why** skill, or `/no-comments`), that reference SHALL load the intended plugin skill.

#### Scenario: poteto-mode routes to how
- **WHEN** poteto-mode's triggers send a nontrivial change to the **how** skill
- **THEN** Claude loads `pstack:how`

### Requirement: Cursor built-ins mapped
References to Cursor built-in skills SHALL point to Claude Code equivalents or be removed. `create-skill` becomes `skill-creator`. The "not Cursor's built-in babysit" clause is removed. "Cursor restart" becomes "session restart".

#### Scenario: Authoring a skill
- **WHEN** poteto-mode's prose trigger points at a skill-authoring helper
- **THEN** it names `skill-creator`
