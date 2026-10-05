# Tasks

## 1. Precondition: start from a pstack-free main

- [x] 1.1 Confirm `remove-pstack` is archived and merged: `openspec list --json` shows no `remove-pstack` change, `openspec list --specs` shows only `session-bar`, and `git ls-files plugins scripts | grep -c pstack` prints `0` on `main`
- [x] 1.2 Create branch `publish-plugins-marketplace` from `main` and verify `git status` is clean and `git branch --show-current` prints it

## 2. Repository edits

- [x] 2.1 Set `name` to `plugins` and `owner.name` to `sufyanMansuriZn` in `.claude-plugin/marketplace.json`; verify `python3 -c 'import json;m=json.load(open(".claude-plugin/marketplace.json"));print(m["name"],m["owner"]["name"],[p["name"] for p in m["plugins"]])'` prints `plugins sufyanMansuriZn ['session-bar']`
- [x] 2.2 Write `README.md` at the root: what the repository is, `claude plugin marketplace add sufyanMansuriZn/plugins`, `claude plugin install session-bar@plugins`, one line per manifest plugin using its `description`, and a sentence that no license is granted; verify `grep -c 'marketplace add sufyanMansuriZn/plugins' README.md` and `grep -c 'session-bar@plugins' README.md` both print at least `1`, and every plugin name in the manifest appears in the README
- [x] 2.3 Write `.gitignore` with `.remember/`, `.DS_Store`, `*.swp`, `.idea/`, `.vscode/`; verify `git check-ignore -q .remember && echo ignored` prints `ignored` and `git status --short` does not list `.remember/`
- [x] 2.4 Replace `/home/sufyan.mansuri/Projects/dev/skills` with `~/Projects/plugins` in `openspec/changes/archive/2026-10-03-port-pstack-to-claude-code/specs/pstack/spec.md`; verify `git grep -nE '/home/[a-z]' -- . ':!openspec/changes/publish-plugins-marketplace'` prints nothing
- [x] 2.5 Confirm no LICENSE exists and none is added: `ls LICENSE* COPYING* 2>/dev/null | wc -l` prints `0`
- [x] 2.6 Run `openspec validate publish-plugins-marketplace` and verify it passes with the `marketplace` delta recognised
- [x] 2.7 Commit tasks 2.1 to 2.4 and the change artifacts as one commit (`Rename marketplace to plugins and prepare for publishing`); verify `git show --stat HEAD` lists `.claude-plugin/marketplace.json`, `README.md`, `.gitignore`, the archived spec, and `openspec/changes/publish-plugins-marketplace/`

## 3. Re-register the marketplace on this machine and rename the directory

- [x] 3.1 Record the before state: `claude plugin marketplace list` includes `skills` as a directory source, and `grep -c 'session-bar@skills' ~/.claude/settings.json` prints `1`
- [x] 3.2 Run `claude plugin uninstall session-bar@skills`; verify `grep -c 'session-bar@skills' ~/.claude/plugins/installed_plugins.json` prints `0`
- [x] 3.3 Run `claude plugin marketplace remove skills`; verify `claude plugin marketplace list` no longer shows `skills` (if it refuses, run `claude plugin disable session-bar@skills` and retry)
- [x] 3.4 Merge the branch to `main` (`git checkout main && git merge --ff-only publish-plugins-marketplace`) and verify `git status` is clean; then tell the user the next step renames the working directory and ends this session
- [ ] 3.5 From a shell outside Claude Code, run `mv ~/Projects/dev/skills ~/Projects/dev/plugins`; verify `ls ~/Projects/dev/plugins/.claude-plugin/marketplace.json` exists and `~/Projects/dev/skills` does not
- [ ] 3.6 Reopen Claude Code in `~/Projects/dev/plugins`, run `claude plugin marketplace add ~/Projects/dev/plugins`, and verify `claude plugin marketplace list` shows `plugins` as a directory source
- [ ] 3.7 Run `claude plugin install session-bar@plugins`; verify `grep -c 'session-bar@plugins' ~/.claude/settings.json` prints `1`, `grep -c 'session-bar@skills' ~/.claude/settings.json` prints `0` (if not, `claude plugin disable session-bar@skills`), `ls ~/.claude/plugins/cache/plugins/session-bar/` shows `0.8.2`, and the session bar is drawn above the prompt in a new session

## 4. Publish to GitHub

- [ ] 4.1 Delete stale branches after confirming their tips are on `main`: for each of `pstack-route-gated-skills` and `sync-version-flag`, `git merge-base --is-ancestor <branch> main && git branch -d <branch>`; if a tip is not an ancestor, show `git log main..<branch> --oneline` to the user and delete with `-D` only on their say-so; verify `git branch` lists only `main`
- [ ] 4.2 Final private-content check on the whole history: `git log -p --all | grep -nE '/home/[a-z]|ghp_|sk-ant|AKIA|password|secret' | grep -v 'sufyan.mansuri/Projects/dev/skills'` prints nothing new beyond the accepted author-email lines, and `git log --format=%ae | sort -u` shows only the expected address
- [ ] 4.3 Create the public, empty GitHub repository `sufyanMansuriZn/plugins` (no README, license or .gitignore): either `env -u GITHUB_TOKEN gh auth login` then `gh repo create sufyanMansuriZn/plugins --public`, or in the browser; verify `gh repo view sufyanMansuriZn/plugins --json visibility -q .visibility` prints `PUBLIC` or the user confirms the page loads
- [ ] 4.4 Run `git remote add origin git@github.com:sufyanMansuriZn/plugins.git` (or the https URL) and `git push -u origin main`; verify `git status -sb` shows `## main...origin/main` with no ahead/behind and the README renders at `https://github.com/sufyanMansuriZn/plugins`

## 5. Integration check

- [ ] 5.1 Verify the public install path once: `claude plugin marketplace add sufyanMansuriZn/plugins --scope local` from a directory outside the repository fails with a name clash or succeeds; if it succeeds, `claude plugin install session-bar@plugins --scope local` succeeds, then remove both (`claude plugin uninstall session-bar@plugins --scope local`, `claude plugin marketplace remove plugins --scope local`) and verify `claude plugin marketplace list` still shows the directory-source `plugins` only
- [ ] 5.2 Walk the README as a stranger: every command in it is pasted verbatim and succeeds or is the one just verified in 5.1; every plugin in `marketplace.json` has a line in the README
- [ ] 5.3 Run `openspec validate` and verify it passes; the change is ready for `/opsx:archive`
