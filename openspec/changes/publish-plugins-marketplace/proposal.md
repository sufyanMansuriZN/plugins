# Proposal

## Why

The repository is a one-plugin Claude Code marketplace that has only ever lived on this machine, under a generic name (`skills`) that reads as Anthropic's catalog and does not match a GitHub URL. Making it public needs a name that is honest about what it holds and will stay honest as plugins of any kind are added, plus the hygiene a stranger expects from a public repository: a README, an ignore file, and no machine-specific paths.

## What Changes

- **BREAKING** Rename the marketplace from `skills` to `plugins` in `.claude-plugin/marketplace.json`, and set `owner.name` to the GitHub account `sufyanMansuriZn`. Every plugin id changes: `session-bar@skills` becomes `session-bar@plugins`. The one existing install (this machine) is re-registered and reinstalled under the new id.
- Rename the repository directory from `~/Projects/dev/skills` to `~/Projects/dev/plugins`, matching the marketplace name and the GitHub repository `sufyanMansuriZn/plugins`.
- Add a root `README.md` that says what the repository is, how to add the marketplace, how to install each plugin, and what each plugin does.
- Add a root `.gitignore` covering the `remember` plugin's `.remember/` directory and the usual editor and OS residue, so an unguarded `git add -A` cannot publish session memory.
- Replace the machine-specific path literal in the archived pstack spec (`openspec/changes/archive/2026-10-03-port-pstack-to-claude-code/specs/pstack/spec.md`) with a neutral example path. This is the only personal path in the tracked tree.
- Create the public GitHub repository `sufyanMansuriZn/plugins`, add it as `origin`, and push `main`. Local branches already merged or abandoned (`pstack-route-gated-skills`, `sync-version-flag`) are deleted and not pushed.
- No LICENSE file. The repository is public-visible and all rights reserved; this is a deliberate choice, recorded here so it is not read as an omission.
- Git history and commit author identity are kept as they are. The commits are authored under the work email that belongs with the `sufyanMansuriZn` account.

Depends on: `remove-pstack` being archived and merged to `main` first. This change starts from a `main` that has `session-bar` as the only plugin and no `pstack` source, tooling, or live spec.

## Capabilities

### New Capabilities

- `marketplace`: the identity and distribution contract of the plugin marketplace itself: its name and owner in the manifest, the install path a reader follows from the README, and the absence of machine-specific or private content in the published tree.

### Modified Capabilities

None. `session-bar` behavior does not change; only the id it is installed under.

## Impact

- `.claude-plugin/marketplace.json`: `name` and `owner.name` change. Claude Code reads this file live from the registered directory source, so the old registration under `skills` must be removed and the directory re-added, then `session-bar` reinstalled, or `session-bar@skills` in `~/.claude/settings.json` points at a marketplace that no longer exists.
- Machine state touched outside the repository: `~/.claude/plugins/known_marketplaces.json` (entry `skills`), `~/.claude/plugins/installed_plugins.json` (`session-bar@skills`), `~/.claude/settings.json` (`enabledPlugins`), `~/.claude/plugins/cache/skills/`. All are rewritten by `claude plugin marketplace remove|add` and `claude plugin install|uninstall`; no hand edits are planned.
- The directory rename changes the Claude Code project slug. The `remember` plugin's history under the old slug stays where it is; nothing in the repository depends on the slug.
- `openspec/changes/archive/...`: one line edited. No other archived content changes.
- New files: `README.md`, `.gitignore`.
- Anyone who later installs from this marketplace gets `session-bar@plugins`; nobody outside this machine has installed `session-bar@skills`.
