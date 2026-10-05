# Proposal

## Why

The pstack port (plugin, sync tooling, and two capability specs) is no longer wanted in this marketplace. It is not installed or enabled on this machine, yet it is the largest thing in the repository (169 tracked files) and carries an upstream-tracking obligation (`scripts/pstack/sync.sh` against a pinned `cursor/plugins` commit) that nobody intends to keep up. Removing it leaves the repository as a marketplace for the plugins actually in use.

## What Changes

- **BREAKING** Remove the `pstack` plugin from the marketplace: delete `plugins/pstack/` and the `pstack` entry in `.claude-plugin/marketplace.json`. `pstack@skills` can no longer be installed, and its skills (`/pstack:poteto-mode`, `/pstack:interrogate`, ...), agents (`poteto-agent`, `comment-sicko`), and hooks disappear.
- Remove the upstream sync tooling under `scripts/pstack/` (`sync.sh`, `test-context.sh`, `UPSTREAM`, `renames.sed`, `lint-allow.txt`, `NOTES.md`, `patches/`, `overlay/`).
- Retire the `pstack` and `pstack-sync` capability specs. Every requirement in both is removed; the spec directories are deleted once the deltas are archived.
- Clean up the machine-level residue the port left in the user's home: the stale plugin cache copy, the `~/.claude/pstack-models.md` role file and its `@pstack-models.md` import in `~/.claude/CLAUDE.md`, the sticky-mode state directory, and the upstream clone cache. These files are outside the repository and are listed as a separate, user-confirmed task group.
- Keep the archived changes under `openspec/changes/archive/` (`2026-10-03-port-pstack-to-claude-code`, `2026-10-04-pstack-route-gated-skills`) and the git history. They record how the port was built and are the recovery path if it is ever wanted again.

Assumption recorded: "Remove pstack" is read as removing the port from this marketplace and tidying what it installed on this machine, not as un-publishing anything elsewhere. No other plugin in the repository references pstack (`session-bar` has no references), and no project settings enable it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pstack`: all 14 requirements removed (installability, tool vocabulary, model defaults and configuration, panel tiers and stances, budget tiers, user-invoked poteto-mode, sticky reminder, worktree isolation, transcript lookup, cross-skill routing, Cursor built-in mapping, subagent plugin-path context).
- `pstack-sync`: all 5 requirements removed (pinned upstream source, source selection, drift failure, residue lint, version scheme).

## Impact

- `.claude-plugin/marketplace.json`: one plugin entry removed; `session-bar` is the only remaining plugin.
- `plugins/pstack/` (133 files) and `scripts/pstack/` (36 files) deleted.
- `openspec/specs/pstack/` and `openspec/specs/pstack-sync/` deleted after archive; `openspec/specs/session-bar/` untouched.
- Machine: `~/.claude/plugins/cache/skills/pstack/`, `~/.claude/pstack-models.md`, the import line in `~/.claude/CLAUDE.md`, `~/.local/state/pstack/`, `~/.cache/pstack-sync/` removed. `pstack` is absent from `~/.claude/plugins/installed_plugins.json` and from `enabledPlugins`, so no uninstall command is needed and no session hook is affected.
- Anyone who had installed `pstack@skills` from this marketplace keeps their cached copy but gets no further updates.
