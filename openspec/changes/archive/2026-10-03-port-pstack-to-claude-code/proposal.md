# Proposal

## Why

pstack (Lauren Tan, MIT, `cursor/plugins/pstack`, v0.15.6) ships rigorous agent workflows: a `/poteto-mode` router, 26 playbooks, 28 principle skills, and multi-model panels. It is published only for Cursor. Its instructions name Cursor tools (`Task`, `AskQuestion`), Cursor paths (`~/.cursor/...`), Cursor cloud agents, and Grok/GPT model slugs that Claude Code cannot run. Upstream ships often (91 commits since 2026-05-23), so a one-time hand fork would fall behind within weeks.

## What Changes

- Add a repeatable sync script that builds `plugins/pstack/` from a pinned upstream commit of `cursor/plugins`. The pipeline is: copy, then a sed table for mechanical renames, then `git apply` for semantic patches, then files we own, then a residue lint that fails on any leftover Cursor-ism.
- Add the generated `plugins/pstack/` plugin, committed, and register it in `.claude-plugin/marketplace.json`.
- Vendor three skills from the sibling `cursor-team-kit` plugin that pstack calls by name: `deslop`, `control-ui`, `control-cli`.
- Map upstream models to Claude tiers by role: `claude-opus` becomes `opus`, `gpt` becomes `fable`, and `grok` becomes `sonnet`. Panels run `opus, fable, sonnet`, and each seat gets a distinct stance so Claude-only panels still disagree.
- Map Cursor cloud workers (`environment: "cloud"`) to local `isolation: "worktree"`.
- Rewrite `/setup-pstack` to write `~/.claude/pstack-models.md` and import it from `~/.claude/CLAUDE.md`. Its budget question chooses a tier, because Claude Code has no per-subagent reasoning effort.
- Keep `/poteto-mode` user-invoked only, as upstream does. A UserPromptSubmit hook makes it sticky for the rest of the session once invoked, and injects upstream's one-line reminder each turn.
- Out of scope: `automations/benny` (Cursor automations), the `make-bot-ui` skill (it drives Cursor-hosted Grok Bot routines through `update_state` and Cursor's webhook API), `docs/guide`, the remaining `cursor-team-kit` skills, and cloud execution.

## Capabilities

### New Capabilities
- `pstack-sync`: how the Claude Code port is regenerated from upstream: the pinned commit, the transform stages, failing loudly on drift, and the residue lint.
- `pstack`: how the ported plugin behaves in Claude Code: model roles and panels, model configuration, the sticky mode reminder, local worktree isolation, and transcript lookup.

### Modified Capabilities

## Impact

- New: `scripts/pstack/` (`sync.sh`, pinned upstream, sed table, patches, overlay with plugin manifest and hook sources), `plugins/pstack/` (generated, about 120 files).
- Modified: `.claude-plugin/marketplace.json` gains a `pstack` entry.
- Runtime dependencies: `git` and `sed` for the sync. `bun` is needed only by pstack's own `orch` and `watch-pr` scripts and is already installed. `gh` is used by the babysit and shipping playbooks.
- User files written by `/setup-pstack` at the user's request: `~/.claude/pstack-models.md` and one import line in `~/.claude/CLAUDE.md`.
- License: upstream `LICENSE` (MIT) and attribution are carried into `plugins/pstack/`.
