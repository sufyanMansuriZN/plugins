# Spec Delta

## REMOVED Requirements

### Requirement: Installable from the local marketplace
**Reason**: The pstack port is withdrawn from this marketplace.
**Migration**: None. Users who still want pstack use Cursor's upstream plugin at `https://github.com/cursor/plugins`, or restore the port from the archived change `2026-10-03-port-pstack-to-claude-code` and git history.

### Requirement: Claude Code tool vocabulary
**Reason**: The plugin whose instructions this governed no longer exists.
**Migration**: None.

### Requirement: Default model per role
**Reason**: The plugin whose roles this governed no longer exists.
**Migration**: None.

### Requirement: Panels use distinct tiers
**Reason**: The multi-model panels no longer exist.
**Migration**: None.

### Requirement: Panel seats take distinct stances
**Reason**: The multi-model panels no longer exist.
**Migration**: None.

### Requirement: Model configuration
**Reason**: `/setup-pstack` and the per-role configuration it wrote are withdrawn.
**Migration**: Delete `~/.claude/pstack-models.md` and remove the `@pstack-models.md` import from `~/.claude/CLAUDE.md`. Nothing else reads that file.

### Requirement: Budget chooses a tier
**Reason**: `/setup-pstack` is withdrawn.
**Migration**: None.

### Requirement: poteto-mode is user-invoked
**Reason**: The poteto-mode skill no longer exists.
**Migration**: None.

### Requirement: Sticky mode reminder
**Reason**: The hook that injected the reminder no longer exists.
**Migration**: Delete the state directory `${XDG_STATE_HOME:-~/.local/state}/pstack/`. Sessions carry no reminder once the plugin is gone.

### Requirement: Local worktree isolation instead of cloud
**Reason**: The playbooks this governed no longer exist.
**Migration**: None.

### Requirement: Claude Code transcript lookup
**Reason**: The recall, session-pickup, eval and worktree-audit skills no longer exist.
**Migration**: None.

### Requirement: Cross-skill references resolve
**Reason**: There are no pstack skills left to cross-reference.
**Migration**: None.

### Requirement: Cursor built-ins mapped
**Reason**: There is no Cursor-derived text left to map.
**Migration**: None.

### Requirement: Subagents know the plugin location
**Reason**: The `UserPromptSubmit`, `SubagentStart` and `SessionStart` hooks that injected the plugin path are withdrawn with the plugin.
**Migration**: None. Subagents receive no pstack context once the plugin is removed.
