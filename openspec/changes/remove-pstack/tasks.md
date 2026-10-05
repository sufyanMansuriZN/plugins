# Tasks

## 1. Remove the plugin and its tooling from the repository

- [x] 1.1 Delete `plugins/pstack/` with `git rm -r` and verify `git ls-files plugins/pstack` prints nothing and `ls plugins` shows only `session-bar`
- [x] 1.2 Delete `scripts/pstack/` with `git rm -r` and verify `scripts/` is gone or empty (`git ls-files scripts` prints nothing)
- [x] 1.3 Remove the `pstack` object from the `plugins` array in `.claude-plugin/marketplace.json` and verify `python3 -c 'import json;print([p["name"] for p in json.load(open(".claude-plugin/marketplace.json"))["plugins"]])'` prints `['session-bar']`
- [x] 1.4 Verify no live reference remains: `git grep -il pstack -- ':!openspec/changes/archive' ':!openspec/changes/remove-pstack' ':!openspec/specs/pstack' ':!openspec/specs/pstack-sync'` prints nothing

## 2. Validate the repository change

- [x] 2.1 Run `openspec validate remove-pstack` from the repo root and verify it passes with both delta specs recognised (`pstack`, `pstack-sync`)
- [x] 2.2 Verify the marketplace still resolves: `claude plugin list` (or the `/plugin` marketplace view for `skills`) shows `session-bar` and no `pstack`
- [x] 2.3 Verify `session-bar` is unaffected: `git diff --stat main -- plugins/session-bar openspec/specs/session-bar` is empty

## 3. Commit

- [ ] 3.1 Commit the deletions and the manifest edit as a single commit on a branch (message: `Remove pstack plugin, sync tooling and specs`) and verify `git show --stat HEAD` lists only deletions under `plugins/pstack/`, `scripts/pstack/`, the manifest change, and the `openspec/changes/remove-pstack/` artifacts

## 4. Clean up the machine-level residue (outside the repo; confirm each path with the user before deleting)

- [ ] 4.1 Confirm `pstack` is still absent from `~/.claude/plugins/installed_plugins.json` and from `enabledPlugins` in `~/.claude/settings.json` (`grep -c pstack` on each prints `0`); if it appears in `enabledPlugins`, remove that line first
- [ ] 4.2 Delete the stale cache copy `~/.claude/plugins/cache/skills/pstack/` and verify `ls ~/.claude/plugins/cache/skills` shows no `pstack`
- [ ] 4.3 Remove the `@pstack-models.md` line from `~/.claude/CLAUDE.md`; if the file is then empty, delete it. Verify `grep -c pstack-models ~/.claude/CLAUDE.md` prints `0` or the file no longer exists
- [ ] 4.4 Delete `~/.claude/pstack-models.md` and verify it no longer exists
- [ ] 4.5 Delete `${XDG_STATE_HOME:-~/.local/state}/pstack/` and `~/.cache/pstack-sync/` and verify neither directory exists
- [ ] 4.6 Start a fresh `claude` session in any project and verify its context carries no pstack model-routing lines and no pstack skills in the skill listing

## 5. Archive and retire the specs

- [ ] 5.1 Run `openspec archive remove-pstack` and verify the change moves to `openspec/changes/archive/` and `openspec/specs/pstack/spec.md` and `openspec/specs/pstack-sync/spec.md` contain no `### Requirement:` lines
- [ ] 5.2 Delete `openspec/specs/pstack/` and `openspec/specs/pstack-sync/` with `git rm -r` and verify `openspec list --specs` shows only `session-bar`
- [ ] 5.3 Run `openspec validate` and commit the archive and spec deletions; verify `git status` is clean
