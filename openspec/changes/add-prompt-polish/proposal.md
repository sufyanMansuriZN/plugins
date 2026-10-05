# Proposal

## Why

What the user types into Claude Code is usually a thin version of what they mean: the goal, the constraints, what "done" looks like and what the agent must not touch stay in their head, and the agent fills the gaps with its own assumptions, costing correction turns in every session. Nothing in Claude Code today sits between typing a prompt and the agent acting on it. The mods API in the installed build (2.1.289) can read the prompt box and write a draft back into it, which makes that missing step buildable as a plugin from this marketplace, with no wrapper process and no external editor.

## What Changes

- Add a new plugin, `prompt-polish`, under `plugins/prompt-polish/`, as a hooks module (mod) that polishes the draft in the prompt box on a deliberate gesture, before Enter. The user types a rough prompt, presses the polish chord, and the draft is rewritten in place with a small fast model; Enter then sends it like any other prompt. Enter is never intercepted and no prompt is ever dropped, so the transcript stays clean.
- The gesture is a chord bound through the engine's own keybinding table (by default ctrl+↓ or alt+↓, the chords of the diff panel's file-list action, which is idle while the prompt is in use), with the band's focus chord (`ctrl+x tab`) plus a digit, a click, and a `/polish` command as the fallbacks. Users who want a dedicated key bind `command:polish` in their own keybindings file.
- Polishing is light-touch: grammar and clarity are fixed, Hindi or Hinglish is translated, and things the user clearly implied (from the recent conversation and the project's instruction file) are made explicit in the user's own voice and order. The result is never restructured into a template, never materially longer, and never gains a requirement the user did not have. Where something important is genuinely unclear, one short trailing line flags it for the user to answer or delete.
- Code, file paths, identifiers, commands and error text are preserved verbatim, enforced mechanically: if any such span from the original is missing from the polished text, the polish is discarded and the draft is left as typed.
- The band above the prompt, laid out like the engine's side-agent notice, shows a one-line hint with the chord while a task-sized draft is in the box, "polishing…" while the model works, and, once polished, a review line with numbered choices: restore the original (the same chord toggles between original and polished), polishing off, dismiss. It goes away when the draft is sent or the box is emptied.
- A `/polish` command toggles the behaviour for the session (`on`, `off`, `restore`) and polishes text given as its argument; the on/off default persists across sessions in the plugin's own store.
- Any failure (model error, timeout, guard failure, box refused) leaves the draft exactly as typed and says why in a transient toast; nothing is lost and nothing enters the session.
- Register the plugin in `.claude-plugin/marketplace.json` and list it in `README.md`, as the marketplace spec requires for every plugin in the manifest.

## Capabilities

### New Capabilities

- `prompt-polish`: the behaviour of the pre-send polishing step: how the user asks for a polish, what the polished text must preserve and must not add, how the user reviews, restores or discards it, how it is switched on and off, and the guarantee that the draft is never lost and nothing is sent without the user's own Enter.

### Modified Capabilities

None. The `marketplace` capability already requires that every manifest entry resolves and is installable and that the README lists every plugin; adding `prompt-polish` satisfies those requirements rather than changing them. `session-bar` is untouched.

## Impact

- New files: `plugins/prompt-polish/.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/register.test.ts`, `types/index.d.ts`, `tsconfig.json`, following the `session-bar` layout.
- `.claude-plugin/marketplace.json`: one new plugin entry. `README.md`: one new plugin line.
- Runtime cost per polish: one small-model completion (haiku, low effort, bounded by a timeout) on the user's own Claude Code account, only when the user asks for it; no network calls other than through the engine's model API.
- Each parallel session that has the plugin installed runs its own hooks and its own completions; there is no shared state beyond the on/off default in the plugin store.
- Hooks used: `ui.render` (AbovePrompt), `prompt.edit`, `prompt.submit` (pass-through housekeeping only), `command.run`, `session.start`. Engine calls used: `$.prompt.read`, `$.prompt.fill`, `$.model.complete`, `$.session.messages`, `$.session.root`, `$.fs.exists`, `$.fs.read`, `$.command.register`, `$.ui.status`, `$.ui.toast`, `$.store`, `$.state`.
- No change to `session-bar`, the OpenSpec tooling, or Claude Code settings outside the plugin's own store. The default chord is taken from the engine's existing keybinding table; the plugin writes no keybinding.
