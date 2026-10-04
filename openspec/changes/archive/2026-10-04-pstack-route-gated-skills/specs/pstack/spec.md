# Spec Delta

## MODIFIED Requirements

### Requirement: Cross-skill references resolve
Whenever a pstack skill or agent tells Claude to use another pstack skill by name (for example `/how`, the **why** skill, or `/no-comments`), Claude SHALL read and follow that skill's `SKILL.md` from the installed pstack plugin. It SHALL do so without calling the Skill tool for a skill that upstream gates with `disable-model-invocation: true`. This holds in the main session and in subagents.

#### Scenario: poteto-mode routes to how
- **WHEN** poteto-mode's Feature playbook reaches "`how` over the affected subsystem"
- **THEN** Claude reads `skills/how/SKILL.md` from the installed plugin and follows it, and the session has no Skill tool call for `how` or `pstack:how`

#### Scenario: Slash reference inside a subagent
- **WHEN** a subagent spawned during a pstack playbook is told to run `/no-comments` before review
- **THEN** it reads `skills/no-comments/SKILL.md` from the installed plugin and applies it, and gets no `disable-model-invocation` refusal

#### Scenario: Agent definition names a gated skill
- **WHEN** a `comment-sicko` agent decides to run `/how` on a symbol
- **THEN** it reads `skills/how/SKILL.md` from the installed plugin rather than calling the Skill tool

#### Scenario: Ungated skill
- **WHEN** a playbook tells Claude to run `/deslop`, which the port ships ungated
- **THEN** either the Skill tool or a direct read loads it, and both are acceptable

## ADDED Requirements

### Requirement: Subagents know the plugin location
Every subagent that starts while pstack is enabled SHALL receive the absolute path of the installed pstack plugin. It SHALL also be told that pstack skills are read from `<pstack>/skills/<name>/SKILL.md` and not through the Skill tool. The main session SHALL receive the same on any turn whose prompt invokes a pstack skill. `<pstack>` in pstack text SHALL mean that path.

#### Scenario: poteto-agent finds poteto-mode
- **WHEN** poteto-mode spawns a `poteto-agent` whose prompt gives no file paths
- **THEN** the agent reads `<pstack>/skills/poteto-mode/SKILL.md` at the injected path before doing any work

#### Scenario: Plan template placeholder
- **WHEN** a subagent runs a multi-phase-plan checklist line such as `cat <pstack>/skills/swarm/SKILL.md`
- **THEN** it substitutes the injected plugin path and the command succeeds

#### Scenario: Main session invoking a pstack skill
- **WHEN** the user's prompt starts with `/pstack:interrogate` or `/interrogate`
- **THEN** that turn's context names the plugin path and the read-not-Skill rule

#### Scenario: Unrelated main-session turn
- **WHEN** the user sends a prompt that invokes no pstack skill in a session where poteto-mode was never invoked
- **THEN** no pstack routing context is added to that turn

#### Scenario: Plugin disabled
- **WHEN** `pstack@skills` is disabled for a project
- **THEN** subagents in that project receive no pstack context
