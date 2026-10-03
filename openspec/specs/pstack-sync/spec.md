# pstack-sync Specification

## Purpose

Regenerates the Claude Code port of pstack from a pinned upstream commit, so upstream improvements can be pulled in repeatedly and every place upstream drifted from the port fails loudly instead of slipping through.

## Requirements

### Requirement: Pinned upstream source
The sync SHALL build from exactly one upstream commit of `cursor/plugins`, recorded in a tracked file. Bumping upstream SHALL mean changing that recorded commit and rerunning the sync. It SHALL NOT mean editing the generated plugin by hand.

#### Scenario: Reproducible build
- **WHEN** the sync runs twice against the same recorded commit
- **THEN** both runs produce byte-identical `plugins/pstack/` trees

#### Scenario: Upstream bump
- **WHEN** the recorded commit changes and the sync runs
- **THEN** `plugins/pstack/` reflects the new upstream content with the same transforms applied, and `git diff` shows only the changes from upstream plus any from updated transforms

### Requirement: Source selection
The generated plugin SHALL contain pstack's `skills/`, `agents/`, and `LICENSE`, plus the `deslop`, `control-ui`, and `control-cli` skills from `cursor-team-kit`. It SHALL NOT contain `automations/`, `docs/`, the Cursor plugin manifest, or `make-bot-ui`, a skill that only works with Cursor-hosted agents.

#### Scenario: Excluded upstream content
- **WHEN** the sync completes
- **THEN** `plugins/pstack/` has no `automations/`, `docs/`, `.cursor-plugin/`, or `skills/make-bot-ui/` directory

#### Scenario: Vendored team-kit skills
- **WHEN** the sync completes
- **THEN** `plugins/pstack/skills/deslop/SKILL.md`, `plugins/pstack/skills/control-ui/SKILL.md`, and `plugins/pstack/skills/control-cli/SKILL.md` exist

### Requirement: Drift fails loudly
When upstream changes a region that a semantic patch edits, the sync SHALL stop with a non-zero exit and name the rejected file. It SHALL NOT write a partial plugin.

#### Scenario: Patched region changed upstream
- **WHEN** a patch no longer applies to the upstream file at the recorded commit
- **THEN** the sync exits non-zero, names the file whose patch failed, and leaves the committed `plugins/pstack/` unchanged

### Requirement: Residue lint
After all transforms, the sync SHALL scan the generated plugin for Cursor-only references: Grok or GPT model slugs, `.cursor` paths, `AskQuestion`, the `Task` tool, `environment: "cloud"`, and references to `cursor-team-kit`. It SHALL fail on any hit outside an explicit allowlist. The allowlist only covers upstream attribution lines.

#### Scenario: New Cursor reference upstream
- **WHEN** upstream adds a skill line mentioning `~/.cursor/rules` and no transform covers it
- **THEN** the sync exits non-zero and prints the file, line, and matched token

#### Scenario: Clean output
- **WHEN** every Cursor reference is transformed
- **THEN** the lint passes and the sync writes `plugins/pstack/`

### Requirement: Version tracks upstream
The generated plugin's version SHALL be the upstream pstack version followed by `-cc.<n>`, where `<n>` counts port revisions against that upstream version and resets to 1 when upstream's version changes.

#### Scenario: First port of an upstream version
- **WHEN** upstream pstack is `0.15.6` and no port of it exists yet
- **THEN** the generated `plugin.json` version is `0.15.6-cc.1`
