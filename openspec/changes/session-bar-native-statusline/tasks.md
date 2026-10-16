# Tasks

## 1. Subtract

- [x] 1.1 Remove `plugins/session-bar/hooks` and `tsconfig.json`. Verify: `git ls-files plugins/session-bar` lists only the manifest.
- [x] 1.2 Archive `session-bar-statusline-rebuild`. Verify: `openspec/specs/session-bar/spec.md` holds its requirements.

## 2. The status line

- [x] 2.1 Capture real statusLine payloads from 2.1.301, before and after the first response, as test fixtures. Verify: the fixtures carry `context_window.used_percentage` `null` and then a number, and `rate_limits` with epoch-second `resets_at`.
- [x] 2.2 Write `statusline.py` with the pure `line(payload, now, git, columns)`. Verify: unit tests for the example row, each segment absent, pace and threshold colors, a passed reset, the width cut, and malformed input printing nothing.
- [x] 2.3 Live check in tmux with the installed copy disabled. Verify: no `⚠ session-bar:` line; the row's figures equal the raw `rate_limits`; at 80 columns only the git part is cut.

## 3. Setup

- [x] 3.1 Write `setup.py` and the `/session-bar:setup` and `/session-bar:remove` commands. Verify: unit tests with a temporary HOME for fresh settings, a saved and restored statusLine, a second run with no change, and other keys kept.
- [x] 3.2 Add the SessionStart hint. Verify: live, the line shows at startup and the model, asked, does not see it.
- [x] 3.3 Run `claude plugin validate plugins/session-bar`. Verify: it passes.

## 4. Docs

- [x] 4.1 Set version 2.0.0 and the new description in `plugin.json`, `README.md` and `.claude-plugin/marketplace.json`, and write `plugins/session-bar/README.md`. Verify: `grep -r "Native status line" README.md .claude-plugin plugins/session-bar` shows the text in each.

## 5. Release

- [ ] 5.1 Archive this change after the user accepts 2.0.0.
