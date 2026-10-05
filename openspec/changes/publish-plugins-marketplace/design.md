# Design

## Context

See proposal.md for motivation. Observed state on 2026-10-05, on the `remove-pstack` branch:

- `.claude-plugin/marketplace.json` has `name: "skills"`, `owner.name: "sufyan.mansuri"`, one plugin (`session-bar`, `./plugins/session-bar`). Nothing else in the tree or in `session-bar` source references the marketplace name; the only `skills` literals outside the manifest are sample paths in tests (`/home/me/.claude/skills`) that are not about this marketplace.
- The marketplace is registered on this machine as a `directory` source pointing at `~/Projects/dev/skills`. `~/.claude/settings.json` enables `session-bar@skills`; `installed_plugins.json` records it at `~/.claude/plugins/cache/skills/session-bar/0.8.2`.
- The repository has no remote, no `README.md`, no `.gitignore`, no `LICENSE`. `.remember/` (the `remember` plugin's store) is untracked and not ignored.
- One tracked file contains a home-directory path: the archived pstack spec, scenario text `/recall runs in /home/sufyan.mansuri/Projects/dev/skills`.
- `gh` is authenticated through a `GITHUB_TOKEN` environment variable whose token is rejected (`HTTP 401`), so `gh repo create` fails until that is fixed.
- Stale local branches: `pstack-route-gated-skills`, `sync-version-flag`. Their content is on `main`.
- `remove-pstack` is in progress (tasks 1.x done, not yet committed to `main` or archived).

## Goals / Non-Goals

**Goals:**
- One identity, `plugins`, for the directory, the GitHub repository and the marketplace name, with `session-bar` reinstalled under it on this machine without hand-editing Claude Code's state files.
- A tracked tree a stranger can read without finding anything about this machine.
- A first push that is `main` only, from a clean working tree.

**Non-Goals:**
- Rewriting git history or author identity.
- Adding a license, CI, a changelog or release tags.
- Changing `session-bar` or the OpenSpec tooling under `.claude/`.
- Publishing to any catalog other than the GitHub repository itself.

## Decisions

**Sequence after `remove-pstack`, not alongside it.** `remove-pstack` is designed around a single revertable deletion commit. Mixing the rename into it would blur that, and this change's spec requirements (`No machine-specific or private content`) are only true once the pstack spec is gone from `openspec/specs/`. This change branches from `main` after `remove-pstack` is archived and merged. Alternative considered: fold the rename into `remove-pstack`. Rejected for the reason above.

**Rename directory and marketplace in one apply, with the Claude Code state changed through the CLI only.** The order is: edit the manifest; `claude plugin uninstall session-bar@skills`; `claude plugin marketplace remove skills`; `mv ~/Projects/dev/skills ~/Projects/dev/plugins`; `claude plugin marketplace add ~/Projects/dev/plugins`; `claude plugin install session-bar@plugins`. Uninstall and remove run while the old path still exists so Claude Code can read what it is removing. Alternative considered: edit `known_marketplaces.json`, `installed_plugins.json` and `settings.json` by hand. Rejected: the CLI owns those files and also clears the cache directory; hand edits are what leave stale `session-bar@skills` keys behind.

**Keep the local registration as a `directory` source, not GitHub.** Development reads the manifest live from the working tree, which is how `session-bar` has been iterated so far. Public users add `sufyanMansuriZn/plugins` from GitHub. The two registrations never coexist on one machine, so there is no name clash. Alternative considered: register from GitHub locally too, to test the public path. Rejected as the standing setup; the public path is tested once as a verification task and then removed.

**The directory rename is the last repository step and ends the session that did it.** The session running the apply has its cwd in `~/Projects/dev/skills`; after `mv`, that cwd is gone, and the Claude Code project slug changes. The task list therefore commits everything first, renames, and tells the user to reopen Claude Code in `~/Projects/dev/plugins` for the remaining verification tasks. The `remember` plugin's history stays under the old slug; nothing in the repository depends on it.

**Edit one line of an archived artifact.** The archive is otherwise read-only history, but a home-directory path is exactly what the spec forbids, and the line is a scenario example whose meaning survives a neutral path (`~/Projects/plugins`). Alternative considered: delete the archived pstack changes entirely. Rejected: `remove-pstack` decided to keep them as the recovery record.

**`.gitignore` is short and specific.** `.remember/`, plus `.DS_Store`, `*.swp`, `.idea/`, `.vscode/`. No `node_modules/` or build output: nothing in the repository builds. Alternative considered: a generic Node template. Rejected: it would ignore things that do not exist and hide what actually matters.

**README is the manifest, in prose.** Three parts: what the repository is (a personal Claude Code plugin marketplace), the two commands (`marketplace add`, `plugin install`), and one line per plugin generated from the manifest's `description`. It states that there is no license. Alternative considered: per-plugin READMEs. Deferred until a plugin needs more than a line.

**GitHub repository is created by the user, or by `gh` once it works.** `gh` currently fails on an invalid `GITHUB_TOKEN`. The apply task has the user either unset that variable for the command (`env -u GITHUB_TOKEN gh auth login`) or create `sufyanMansuriZn/plugins` in the browser as public, empty (no README, no license, no `.gitignore`), then add it as `origin`. Either way the repository is created empty so the first push is our `main`.

**Prune stale branches before pushing.** `pstack-route-gated-skills` and `sync-version-flag` are deleted locally with `git branch -D` after confirming their commits are reachable from `main` (`git log main --oneline | grep <sha>`). Only `main` is pushed.

## Risks / Trade-offs

- [`marketplace remove skills` fails because `session-bar@skills` is still installed] → Uninstall runs first; if the remove still refuses, `claude plugin disable session-bar@skills` then retry.
- [After `mv`, the session bar vanishes until reinstalled, and the old `session-bar@skills` key lingers in `enabledPlugins`] → `install session-bar@plugins` restores the bar; verify with `grep -c 'session-bar@skills' ~/.claude/settings.json` printing `0`, and if not, `claude plugin disable session-bar@skills` to clear it rather than editing the file.
- [The old directory source stays registered under `skills` and points at a path that no longer exists] → Covered by removing it before the rename; verify with `claude plugin marketplace list` showing `plugins` and no `skills`.
- [`gh` stays broken] → Browser creation of the repository is a complete fallback; nothing else in the change needs `gh`.
- [Something private is in git history even though the tree is clean] → Checked: history holds the same single path literal and the author email; both were accepted in the proposal. A final `git log -p | grep` before push confirms nothing else.
- [Renaming the project directory changes Claude Code's per-project data (`~/.claude/projects/<slug>`)] → Expected and harmless; transcripts and `remember` history for the old slug remain on disk.

## Migration Plan

1. Finish and archive `remove-pstack`; merge to `main`; branch `publish-plugins-marketplace` from it.
2. Repository edits: manifest, README, `.gitignore`, archived spec line. Commit.
3. Machine: uninstall, marketplace remove, `mv`, marketplace add, install. Reopen Claude Code in the new directory.
4. GitHub: create empty public repository, `git remote add origin`, push `main`. Prune stale branches.
5. Verify the public path once from GitHub (`marketplace add sufyanMansuriZn/plugins` on a scratch scope, then remove it), archive the change.

Rollback before the push: `git revert` the commit and run the CLI steps in reverse with the old names. After the push, the repository can be made private again in GitHub settings; the marketplace name stays `plugins`.
