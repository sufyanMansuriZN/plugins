# Spec Delta

## REMOVED Requirements

### Requirement: Pinned upstream source
**Reason**: The port is no longer regenerated from upstream; the sync tooling is deleted with it.
**Migration**: None. The last pinned commit (`23e4138d`, upstream 0.15.6) is recorded in the archived change `2026-10-04-pstack-route-gated-skills` and in git history.

### Requirement: Source selection
**Reason**: There is no generated plugin to select sources for.
**Migration**: None.

### Requirement: Drift fails loudly
**Reason**: There are no patches left to drift.
**Migration**: None.

### Requirement: Residue lint
**Reason**: There is no generated output to lint.
**Migration**: None.

### Requirement: Version tracks upstream
**Reason**: No pstack plugin version is published from this marketplace any more.
**Migration**: None. The final published version was `0.15.6-cc.2`.
