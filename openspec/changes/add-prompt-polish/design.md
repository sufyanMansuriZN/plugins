# Design

## Context

See proposal.md for motivation and specs/prompt-polish/spec.md for the behaviour contract. Observed on 2026-10-05 against Claude Code 2.1.289's mods API (the `claude-code.d.ts` the plugin-authoring skill writes) and the engine's default keybinding table:

- `$.prompt.read()` returns the prompt box as it stands, `{ text, cursor }`, and never rejects. `$.prompt.fill({ text, mode: 'replace', decorations })` writes the box as the user's draft and resolves `{ isFilled, refusal? }`. Decorations paint ranges of the filled text and are cleared by the next edit unless a `prompt.edit` hook re-answers them.
- `prompt.submit` fires after Enter. A hook that answers `{ drop }` always produces the engine's transcript line "Prompt dropped by a hook: …"; there is no silent drop in this build. The line is UI-only (the model never sees it) but it is drawn for every held prompt. This design therefore never drops: the plugin's `prompt.submit` hook only tidies its own state and calls `next(e)`.
- A `ui.render` hook on `{ component: 'AbovePrompt' }` draws the band above the prompt; `e.props.hasSurvey` is true while a survey holds it. The band has no prop for the box text, so the plugin tracks the draft itself through `prompt.edit`, which fires on every edit the person makes and resolves to the box after the edit.
- A band `Button` takes `hotkey` (one digit or lowercase letter, pressed while the band holds focus: after `ctrl+x tab`, a click, or a bare digit from an empty composer) and `action`, an engine keybinding action name whose chord, as the person has bound it, presses the Button from the prompt while the Button is mounted, no dialog is up and no engine handler of that action is mounted. `action` accepts only the engine's own action names (the validator's own examples are `app:cycleDiffBase` and `app:diffFileListDown`), never `command:` bindings.
- The default keybinding table binds `app:diffFileListDown` to `ctrl+down` and `meta+down` in the Global context, and the engine handles it only while the diff panel is open. `app:cycleDiffBase` is bound only inside the diff panel, so it has no chord at the prompt. The keybindings file also accepts `command:<name>` actions in the Chat context, so a user can bind any chord to `/polish`.
- `$.model.complete({ model, prompt, system, maxTokens, effort, timeoutMs })` never throws; it resolves `{ isAnswered: true, text, usage }` or `{ isAnswered: false, reason }`. A Button's `onPress` handler and a `command.run` hook may await it. `$.ui.status(text)` sets a status-line entry; `$.ui.toast(text, { timeoutMs })` shows a transient line that leaves the transcript and the model untouched.
- `$.session.messages()` returns the main conversation as rows `{ role, text, toolUses, toolResults? }`. `$.session.root()` gives the project root; `$.fs.exists` and `$.fs.read` read a file.
- `$.command.register({ name, description })` in `session.start` plus a `command.run` hook answering `{ text }` gives a `/polish` command; `e.args` carries everything typed after the name. `$.store` is the plugin's JSON store across sessions; `$.state` (via `atom` / `read` / `update`) holds session values that survive hot reloads and drive redraws. `$.state.set` refuses `undefined`, so a cleared value is written as `null`.
- The repository convention (from `session-bar`): one folder per plugin with `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/register.test.ts`, `types/index.d.ts` declaring the plugin's `PluginState`, and a `tsconfig.json` extending the engine-written one. Pure functions are exported from the module and unit-tested; engine behaviour is tested through `claude-code/testing` with `on(...)` mocks beneath the plugin.

## Goals / Non-Goals

**Goals:**
- No transcript noise: nothing the plugin does produces a transcript line. Enter is Enter.
- One gesture polishes, the same gesture restores; review happens in the box before anything is sent.
- Every path leaves the user's text in the box. There is no state in which the draft is lost or the user has to retype.
- The pure parts (polishable check, span extraction, guard, diff for decorations, prompt assembly, context trimming) are exported functions with unit tests; the engine-facing parts are tested with mocked `$` operations.

**Non-Goals:**
- A side-by-side review pane. The band plus the prompt box is the v1 review surface.
- Any model other than the engine's small fast model, or any configurable prompt template. One system prompt, tuned in tests.
- Per-project on/off or per-project prompt rules. One default across sessions, one session toggle.
- Writing the user's keybindings file. The plugin names the chord it listens on; rebinding is the user's.
- Polishing automatically on a typing pause. Considered and rejected for v1: the box would change under the user and every pause would cost a completion.

## Decisions

**Polish on a gesture, never on Enter.** The polish runs from a band Button's `onPress`, from the chord bound to that Button's `action`, or from `/polish`. It reads the box with `$.prompt.read()`, polishes the text, and writes the result back with `$.prompt.fill` in `replace` mode with the added words decorated. Enter then goes through `prompt.submit` untouched. Alternative considered and built first: intercept Enter, fill the polished text, answer `{ drop }` and let the next Enter send. Rejected after the live check: every `{ drop }` draws "Prompt dropped by a hook: …" in the transcript and the engine offers no way around it. Alternative considered: `next({ ...e, text: polished })` sending the polished text immediately. Rejected: review after sending is not review.

**The default chord is whatever is bound to `app:diffFileListDown`.** The polish and restore Buttons carry `action="app:diffFileListDown"`. The engine's default table binds that action to ctrl+↓ and alt+↓ globally and handles it only while the diff panel is open, so at the prompt the chord reaches the Button. Reasons for this action over the other candidates: it is one of the two the engine's own validator names as examples; it has two default chords, which helps in terminals that swallow ctrl+arrow; nothing in the Chat context competes for either chord; and a user who rebinds the action moves the polish key with it. `app:cycleDiffBase` was rejected because it is bound only in the diff panel's context and so has no chord at the prompt. The band text names the chord as `ctrl+↓`. While the diff panel is open the chord scrolls its file list instead; the band's hotkey path and `/polish` remain. The spec commits to the chord conditionally: the first live check confirms the chord presses the Button at the prompt and, if it does not, the band text falls back to `ctrl+x tab, then 1`.

**A dedicated key is one line of the user's own keybindings.** `command:polish` in the Chat context runs the command from a chord of the user's choice. The `command.run` hook reads the box with `$.prompt.read()` when `e.args` is empty, so a keybound `/polish` polishes the draft if the engine leaves the draft in the box; `/polish <text>` polishes the given text either way. The first live check establishes which of the two paths a keybound command takes; the status output documents the result.

**The band is the only surface and follows the engine's side-agent notice.** The `AbovePrompt` hook answers `next(e)` when polishing is off, a survey holds the band, or nothing is to be shown. Otherwise it draws a star column (`✦`), a dim tag and lead line, and a wrapped row of plain numbered choices, one of three states:

- *ready* (a task-sized draft is in the box, nothing held): tag `polish`, lead "ctrl+↓ polishes this draft before you send it, or ctrl+x tab, then:", choices `1: Polish draft` (with the action) and `2: Polishing off`.
- *busy*: tag `polish`, lead "polishing…", no choices.
- *held* (a polish landed): tag `polished`, lead "review and press Enter to send · ctrl+↓ swaps the original back", choices `1: Restore original` or `1: Use polished` (with the action; the label follows which text is in the box), `2: Polishing off`, `0: Dismiss` (role `dismiss`).

The Button with the action must be mounted for the chord to work, so the ready hint is not hideable; it is one dim line and appears only for drafts the plugin would polish. Alternative considered: a Button hidden behind an empty label so the hint could be turned off. Rejected: invisible controls, and a refused tree risk.

**The draft is tracked through `prompt.edit`, with writes only on change.** The hook awaits `next(e)`, computes `ready = polishable(box.text)` and, while a draft is held, which of the two texts the box shows (`polished`, `original` or `edited`). It writes an atom only when the value changed, so a draft costs at most a handful of redraws, not one per keystroke. The box becoming empty clears the hold. `prompt.submit` from the composer clears both `ready` and the hold and calls `next(e)`, because the engine empties the box on send without a `prompt.edit`. `command.run` for `polish` also clears `ready`, since typing the command empties the box.

**`polishable` replaces the gate.** The ready hint shows, and the chord polishes, when the draft has at least 6 words, is not a single line starting with `/` or `!`, and is not made only of acknowledgement words (English and Hinglish). Origin, running turn and attachments no longer matter: the user asks explicitly, and a polished draft typed over a running turn is queued by the engine like any other. The chord on a draft below the threshold polishes it anyway (a deliberate press is a deliberate press); the hint is a discoverability aid, not a gate.

**Pressing the chord while a hold exists swaps, unless the draft was edited.** With `held` set: if the box equals the polished text, fill the original; if it equals the original, fill the polished text again with its decorations; otherwise (the user edited the draft) polish the current text afresh and replace the hold. The Button label follows the tracked view so it never promises a swap it would not do.

**Context is small and fixed.** The last 6 rows of `$.session.messages()`, keeping only `text` (tool output dropped), each cut to 400 characters; plus the first 2,000 characters of `<root>/CLAUDE.md` when it exists. Total context stays under about 5,000 characters, which keeps haiku's latency in the low seconds.

**One completion with a strict system prompt.** `$.model.complete({ model: 'haiku', effort: 'low', maxTokens: 1024, timeoutMs: 8000 })`. The system prompt states the light-touch rules from the spec: keep the user's order and voice; fix grammar; translate Hindi or Hinglish to English; replace a pronoun with its referent only when the context establishes exactly one; never add requirements; keep every code span, path, identifier, command and error verbatim; at most one trailing clarification line, on its own line, and only when something important is unclear; output the polished prompt only. The user message carries the context block and the original prompt, delimited so the model cannot confuse them.

**The preservation guard is mechanical and runs before the fill.** `spans(original)` extracts backtick spans, fenced blocks, path-like and identifier-like tokens, URLs, error-like lines and quoted phrases; `preserves(original, polished)` is true only if every span appears verbatim in the polished text. `withinLength` discards a reply longer than 1.5× the original plus 80 characters. On any failure the box is left as typed and `$.ui.toast` says why; no fill happens, so nothing to undo.

**Decorations come from a word-level diff.** `added(original, polished)` computes the words in the polished text not in the original (longest common subsequence over words) and returns their character ranges; the fill passes them as `decorations` with a distinct colour. No `prompt.edit` hook re-answers them, so they vanish at the first edit.

**Busy is a flag, status and band together.** While the completion runs, a `busy` atom is set (the band shows "polishing…"), `$.ui.status('polishing…')` is set, and a second press is ignored. Both clear in `finally`.

**`/polish` is toggle, fallback trigger and restore.** `on` and `off` write `$.store.set('enabled', bool)` and the session atom (`off` also clears the hold); `restore` fills the held original; any other argument is text to polish; no argument polishes the box when it holds text and otherwise reports status, the chord and the `command:polish` binding.

**Layout follows `session-bar`.** `types/index.d.ts` declares `PluginState['prompt-polish']` as `{ enabled: boolean; ready: boolean; busy: boolean; held?: Held | null }` with `Held = { original: string; polished: string; view: 'polished' | 'original' | 'edited' }`. Pure helpers (`polishable`, `isAck`, `spans`, `preserves`, `withinLength`, `added`, `trimContext`, `buildPrompt`, `clean`) are exported for tests.

## Risks / Trade-offs

- [The chord may not reach the Button at the prompt] → The types say an action's chord presses a mounted Button when no engine handler is mounted; the diff panel's handler should be absent while the prompt is in use. Confirmed only by the live check; the fallback (`ctrl+x tab`, then `1`) is in the band text either way, and the spec scenario is adjusted if the chord fails.
- [A keybound `command:polish` may clear the box before `command.run`] → Then `/polish` with no argument reports status instead of polishing, and the live check records that `command:polish` is not a polish key in this build; the chord remains the primary gesture.
- [The ready hint is one more line above the prompt on every task-sized draft] → Accepted: the Button has to be mounted for the chord to work. The line is dim, appears only for drafts the plugin would polish, and vanishes when the box empties or the draft is sent.
- [`prompt.edit` does not fire for fills the engine or other plugins make (history recall, stash)] → The hint may lag such a change until the next keystroke; the chord and `/polish` still read the real box, so nothing wrong is polished.
- [haiku rewrites more than asked despite the system prompt] → The guard catches technical damage; the length cap catches template-like expansion; the trailing-question rule is checked in tests by prompt tuning, not code.
- [Latency on a slow connection exceeds the 8s bound] → The timeout leaves the draft as typed and a toast says so; the user sends it unpolished or presses again.
- [Session state and the band are per session; parallel sessions each pay one completion per polish] → Expected and within the stated cost constraint; nothing is shared except the on/off default.

## Migration Plan

1. Build the plugin under `plugins/prompt-polish/` on a branch; validate, type-check and test with the plugin tooling; try it live through the dev-mods hot-reload folder or `claude --plugin-dir`.
2. Add the manifest entry and README line; commit; push `main`.
3. On this machine: `claude plugin marketplace update plugins`, then `claude plugin install prompt-polish@plugins`. Each parallel session picks it up on its next start.
4. Rollback: `claude plugin uninstall prompt-polish@plugins`, or `/polish off` for a session. Nothing outside the plugin's own store is written.

## Open Questions

- Whether the user's global `~/.claude/CLAUDE.md` should join the project file in the context block. Deferred: it changes only the `trimContext` input list, not the specs or tasks, and can be decided after a week of use.
