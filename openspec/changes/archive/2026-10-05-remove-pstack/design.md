# Design

## Context

See proposal.md for motivation. The repository is a local Claude Code plugin marketplace with two plugins, `session-bar` and `pstack`. pstack is a generated tree (`plugins/pstack/`, 133 files) produced by `scripts/pstack/sync.sh` from a pinned upstream commit plus patches and an overlay (`scripts/pstack/`, 36 files). Two main specs describe it: `openspec/specs/pstack/spec.md` (14 requirements) and `openspec/specs/pstack-sync/spec.md` (5 requirements).

Observed machine state on 2026-10-05:
- `pstack` is absent from `~/.claude/plugins/installed_plugins.json` and from `enabledPlugins` in `~/.claude/settings.json`. Only `session-bar@skills` is installed from this marketplace.
- A stale cache copy exists at `~/.claude/plugins/cache/skills/pstack/0.15.6-cc.1/` (one version behind the repo's `0.15.6-cc.2`).
- `~/.claude/CLAUDE.md` consists of a single line, `@pstack-models.md`, and `~/.claude/pstack-models.md` exists (written by `/setup-pstack`).
- `~/.local/state/pstack/mode/` holds sticky-mode session markers; `~/.cache/pstack-sync/plugins.git` is the sync script's upstream clone.
- The `skills` marketplace is registered as a `directory` source pointing at this repository, so Claude Code reads `marketplace.json` live; no re-registration is needed after editing it.
- Nothing outside `plugins/pstack/`, `scripts/pstack/`, the two specs, the marketplace entry, and the archived changes mentions pstack (`git grep -il pstack`).

## Goals / Non-Goals

**Goals:**
- Leave the repository with no pstack source, tooling, or live spec, and the marketplace manifest valid with `session-bar` as its only plugin.
- Leave the user's home directory free of files that only pstack created or read, without touching anything another plugin or Claude Code itself uses.
- Keep the archived changes and git history intact as the recovery path.

**Non-Goals:**
- Replacing pstack with another workflow plugin, or vendoring any of its individual skills (`deslop`, `control-ui`, `unslop`, ...) elsewhere. Any skill worth keeping is a separate change.
- Rewriting the archived changes to pretend the port never existed.
- Changing `session-bar` or the OpenSpec tooling under `.claude/`.

## Decisions

**Delete the generated tree and the generator together.** `plugins/pstack/` is regenerable from `scripts/pstack/`, so keeping one without the other is meaningless. Deleting both in one commit keeps `git revert` of that commit a complete restore. Alternative considered: keep `scripts/pstack/` so the port could be regenerated later. Rejected because the archived change plus git history already serve that purpose, and a dormant sync script against a moving upstream rots.

**Express the spec removal as REMOVED deltas and retire the capabilities at archive time.** `## REMOVED Requirements` under each capability is the supported form. When a change removes a capability's last requirement, `openspec archive` refuses to write a spec with zero requirements unless the change's `.openspec.yaml` sets `retire_capabilities: true`; with that flag the archive deletes `openspec/specs/pstack/` and `openspec/specs/pstack-sync/` itself. The change sets the flag, so no hand deletion is needed. Alternative considered: delete the main spec files during apply and set `skip_specs`. Rejected because it loses the Reason/Migration record and leaves the archive with nothing to sync.

**Keep the archived changes.** They are the only written record of the port's design decisions (panel stances, hook routing, transcript paths) and are referenced from the REMOVED migrations. Deleting them saves nothing material.

**Treat home-directory cleanup as a separate, confirmed task group.** Those paths are outside the repository and outside the allowed edit roots reported by `openspec status` (`actionContext.allowedEditRoots`). Each deletion is reversible only from backups, so the apply phase shows the user the exact paths before removing them. Removing the import line from `~/.claude/CLAUDE.md` leaves that file empty; the task deletes the file in that case rather than leave an empty global instructions file. If the user has since added other lines, only the import line is removed.

**No uninstall command.** pstack is not registered as installed, so `claude plugin uninstall pstack@skills` has nothing to act on. The stale cache directory is removed by hand. Alternative considered: run the uninstall anyway for safety. Rejected because it would error on a plugin that is not installed and confuse the record.

**Order: repository first, then home directory.** The repository change is committed and verifiable on its own. The home cleanup depends on nothing in the repository and can be skipped or deferred without affecting the change.

## Risks / Trade-offs

- [A session is still running with pstack hooks loaded from the stale cache] → Not possible on this machine: the plugin is not enabled, so no hooks load. If `enabledPlugins` ever gains `pstack@skills: true`, remove that line first.
- [Removing `@pstack-models.md` changes the user's global `~/.claude/CLAUDE.md`] → The file is checked before editing; only the import line is removed, and the user confirms the task before it runs.
- [Someone else installed `pstack@skills` from a clone of this repository] → They keep their cached copy and lose updates. Acceptable; the proposal marks this breaking.
- [`openspec archive` refuses a spec left with zero requirements] → `retire_capabilities: true` in `.openspec.yaml` tells it to delete the spec instead; the final task verifies both directories are gone and re-runs `openspec validate`.

## Migration Plan

1. Apply tasks 1 to 3 on a branch; verify with `git status`, `openspec validate remove-pstack`, and a marketplace listing that shows only `session-bar`.
2. Commit as one removal commit. Rollback is `git revert` of that commit.
3. Run the home-directory cleanup (task group 4) with the user present or explicitly authorised; it is independent of the commit.
4. Archive the change with `retire_capabilities: true`; verify the two spec directories are gone; validate; commit.
