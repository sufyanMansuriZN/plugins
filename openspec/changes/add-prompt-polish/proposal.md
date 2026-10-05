# Proposal

## Why

What the user types into Claude Code is usually a thin version of what they mean: the goal, the constraints, what "done" looks like and what the agent must not touch stay in their head, and the agent fills the gaps with its own assumptions, costing correction turns in every session. Nothing in Claude Code today sits between typing a prompt and the agent acting on it. The mods API in the installed build (2.1.289) can drop a submitted prompt and write a draft back into the prompt box, which makes that missing step buildable as a plugin from this marketplace, with no wrapper process and no external editor.

## What Changes

- Add a new plugin, `prompt-polish`, under `plugins/prompt-polish/`, as a hooks module (mod) that intercepts a submitted prompt before it enters the session, polishes it with a small fast model, and puts the result back into the prompt box as an editable draft. The user's next Enter sends it; nothing reaches the agent without that Enter.
- Polishing is light-touch: grammar and clarity are fixed, Hindi or Hinglish is translated, and things the user clearly implied (from the recent conversation and the project's instruction file) are made explicit in the user's own voice and order. The result is never restructured into a template, never materially longer, and never gains a requirement the user did not have. Where something important is genuinely unclear, one short trailing line flags it for the user to answer or delete.
- Code, file paths, identifiers, commands and error text are preserved verbatim, enforced mechanically: if any such span from the original is missing from the polished text, the polish is discarded.
- The band above the prompt shows a one-line status while a polished draft is in the box, and offers restore (original text back in the box) and off, pressed by a digit once the box is empty, the same convention Claude Code's own surveys use.
- A `/polish` command toggles the behaviour for the session (`on`, `off`, `restore`); the default persists across sessions in the plugin's own store.
- Short conversational replies, prompts typed while a turn is running, slash commands and non-composer prompts (notifications, peers, schedules) are never intercepted.
- Any failure (model error, timeout, guard failure, box refused) results in the original text going through unchanged, either entering the session directly or restored to the box.
- Register the plugin in `.claude-plugin/marketplace.json` and list it in `README.md`, as the marketplace spec requires for every plugin in the manifest.

## Capabilities

### New Capabilities

- `prompt-polish`: the behaviour of the pre-send polishing step: when a prompt is intercepted and when it is not, what the polished text must preserve and must not add, how the user reviews, restores or discards it, how it is switched on and off, and the guarantee that no failure ever loses or blocks the user's prompt.

### Modified Capabilities

None. The `marketplace` capability already requires that every manifest entry resolves and is installable and that the README lists every plugin; adding `prompt-polish` satisfies those requirements rather than changing them. `session-bar` is untouched.

## Impact

- New files: `plugins/prompt-polish/.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/register.test.ts`, `types/index.d.ts`, `tsconfig.json`, following the `session-bar` layout.
- `.claude-plugin/marketplace.json`: one new plugin entry. `README.md`: one new plugin line.
- Runtime cost per intercepted prompt: one small-model completion (haiku, low effort, bounded by a timeout) on the user's own Claude Code account; no network calls other than through the engine's model API.
- Each parallel session that has the plugin installed runs its own hook and its own completion; there is no shared state beyond the on/off default in the plugin store.
- Hooks used: `prompt.submit`, `ui.render` (AbovePrompt), `command.run`, `session.start`, `prompt.edit`. Engine calls used: `$.prompt.fill`, `$.model.complete`, `$.session.messages`, `$.session.root`, `$.fs.read`, `$.command.register`, `$.store`, `$.state`.
- No change to `session-bar`, the OpenSpec tooling, or Claude Code settings outside the plugin's own store.
