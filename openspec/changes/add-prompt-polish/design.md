# Design

## Context

See proposal.md for motivation and specs/prompt-polish/spec.md for the behaviour contract. Observed on 2026-10-05 against Claude Code 2.1.289's mods API (the `claude-code.d.ts` the plugin-authoring skill writes):

- `prompt.submit` fires after Enter and before the prompt enters the session. A hook may answer `{ drop: reason }` without calling `next`; the reason is shown to the user as a one-line notice and nothing enters the session. `e.origin.kind` distinguishes the composer from notifications, peers, schedules and plugins; `e.turnId` is set when the prompt was typed over a running turn; `e.attachments` is present when images or documents were pasted.
- `$.prompt.fill({ text, mode: 'replace', decorations })` writes the prompt box as the user's draft and resolves `{ isFilled, refusal?, text, cursor }`. Decorations paint ranges of the filled text and are cleared by the next edit unless a `prompt.edit` hook re-answers them.
- `$.model.complete({ model, prompt, system, maxTokens, effort, timeoutMs })` never throws; it resolves `{ isAnswered: true, text, usage }` or `{ isAnswered: false, reason }`. A hook's own budget is 10s, and time spent inside `$` calls does not count against it, so the hook can await the completion and still return a result.
- `$.session.messages()` returns the main conversation as rows `{ role, text, toolUses, toolResults? }`. `$.session.root()` gives the project root; `$.fs.read(path)` reads a file.
- A `ui.render` hook on `{ component: 'AbovePrompt' }` draws the band above the prompt; `e.props.hasSurvey` is true while a survey holds it. A band `Button` with a digit `hotkey` is pressed by that bare digit when the composer is empty (the surveys' convention) or after `ctrl+x tab` focuses the band.
- `$.command.register({ name, description })` in `session.start` plus a `command.run` hook answering `{ text }` gives a `/polish` command. `$.store` is the plugin's JSON store across sessions; `$.state` (via `atom` / `read` / `update`) holds session values that survive hot reloads and drive redraws.
- Slash commands fire `command.run`, not `prompt.submit`; `!` bash lines are handled by the composer and never become a prompt. `@` mentions arrive already expanded in `e.text`.
- The repository convention (from `session-bar`): one folder per plugin with `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/register.test.ts`, `types/index.d.ts` declaring the plugin's `PluginState`, and a `tsconfig.json` extending the engine-written one. Pure functions are exported from the module and unit-tested; engine behaviour is tested through `claude-code/testing` with `on(...)` mocks beneath the plugin.

## Goals / Non-Goals

**Goals:**
- The whole loop lives in one hooks module with no dependencies: intercept, polish, fill, review, send or restore.
- Every path out of the hook ends with the user's text either in the session or in the box. There is no state in which the prompt is lost or the user has to retype.
- The pure parts (gate, span extraction, guard, diff for decorations, prompt assembly, context trimming) are exported functions with unit tests; the engine-facing parts are tested with mocked `$` operations.

**Non-Goals:**
- A side-by-side review pane. The band plus the prompt box is the v1 review surface.
- Any model other than the engine's small fast model, or any configurable prompt template. One system prompt, tuned in tests.
- Per-project on/off or per-project prompt rules. One default across sessions, one session toggle.
- Handling the desktop or VS Code composer specially. The hooks are surface-neutral; if `$.prompt.fill` refuses with `no_composer`, the prompt passes through.

## Decisions

**Hold the prompt by awaiting the work inside `prompt.submit`, then answer `{ drop }`.** The hook gates, gathers context, awaits the completion, runs the guard, fills the box, and only then returns `{ drop: <what happened> }`. The drop reason is therefore accurate ("polished; Enter sends, clear the box and press 1 to restore" or "polish discarded, original restored"). While the completion runs the hook sets `$.ui.status('polishing…')` and clears it after. Alternative considered: return `{ drop }` immediately and finish the work in a detached promise. Rejected: the engine treats work that outlives the hook as lingering, and the notice could not say what happened.

**Pass-through is an "armed" flag in session state, not text comparison.** After a successful fill or a restore, `armed` is set; the next `prompt.submit` from the composer sees it, clears it, and calls `next(e)`. A `prompt.edit` hook clears `armed` and the held original when the box becomes empty, so a fresh prompt typed after clearing is polished again. Alternative considered: compare the submitted text with the filled text. Rejected: any edit breaks equality, and edits are the point.

**The gate is heuristic only.** Pass through when any of: polishing is off; `e.origin.kind !== 'composer'`; `e.turnId` is set; `e.attachments` is present; the text is under a word threshold (default 6 words) or matches an acknowledgement list in English and Hinglish (yes, ok, go ahead, do it, haan, theek hai, kar do, chalo, and similar); the text is a single line that starts with `/` or `!` (belt and braces: the engine should never deliver these). No model classification call. Alternative considered: `$.model.classify` for task-versus-reply. Rejected: it doubles latency for the common short reply, and the toggle command is the escape hatch when the heuristic is wrong.

**Context is small and fixed.** The last 6 rows of `$.session.messages()`, keeping only `text` (tool output dropped), each cut to 400 characters; plus the first 2,000 characters of `<root>/CLAUDE.md` when it exists. Total context stays under about 5,000 characters, which keeps haiku's latency in the low seconds. Alternative considered: including `.claude/CLAUDE.md` and the user's global instructions. Deferred: add later if the project file alone proves insufficient.

**One completion with a strict system prompt.** `$.model.complete({ model: 'haiku', effort: 'low', maxTokens: 1024, timeoutMs: 8000 })`. The system prompt states the light-touch rules from the spec: keep the user's order and voice; fix grammar; translate Hindi or Hinglish to English; make an implied thing explicit only when the context clearly supports it; never add requirements; keep every code span, path, identifier, command and error verbatim; at most one trailing clarification line and only when something important is unclear; output the polished prompt only, no preamble or fences. The user message carries the context block and the original prompt, delimited so the model cannot confuse them.

**The preservation guard is mechanical and runs before the fill.** `spans(original)` extracts: backtick spans, fenced blocks, tokens containing `/` or `.` with a file-like tail, tokens with `_`, `::`, `->`, `()` or camelCase, lines that look like errors (`Error`, `error:`, `at ` stack frames, `exit code`), URLs, and anything inside quotes longer than two words. `preserves(original, polished)` is true only if every span appears verbatim in the polished text. On failure the hook fills the original and reports the discard. Alternative considered: trusting the system prompt. Rejected: cheap to check, and the failure mode is exactly the one the user said they cannot tolerate.

**Decorations come from a word-level diff.** `added(original, polished)` computes the words in the polished text not in the original (longest common subsequence over words) and returns their character ranges; the fill passes them as `decorations` with a distinct colour. No `prompt.edit` hook re-answers them, so they vanish at the first edit, which is what the spec asks for. Alternative considered: a persistent highlight. Rejected: once the user is editing they have read it, and persistent paint fights their edits.

**Band is one dim line with two digit buttons, drawn only while a draft is held.** The `AbovePrompt` hook returns `next(e)` unless `held` is set and no survey holds the band. Otherwise it draws: "polished · clear the box and press 1 to restore" with `Button hotkey="1" label="Restore original"` and `Button hotkey="2" label="Polishing off"`. Restore refills the original, keeps `held`, sets `armed`. Off calls the same path as `/polish off`. Alternative considered: a `Button` with an engine `action` so a chord works from the prompt. Rejected: it requires the user to bind a chord to an unrelated engine action; the empty-box digit path needs no setup.

**`/polish` is the toggle and the fallback restore.** Registered in `session.start`; `command.run` answers `{ text }` for `on`, `off`, `restore` and no argument (status). `on` and `off` write `$.store.set('enabled', bool)` and the session atom; `session.start` reads the store to seed the atom, defaulting to on. Alternative considered: a `userConfig` option. Rejected for v1: the store is enough, and `/polish` is discoverable in the typeahead.

**Failure handling is one function.** `giveBack(reason)` fills the original (`replace`), sets `armed`, and returns `{ drop: reason }`. If that fill is refused with `no_composer` or `dialog`, the hook instead returns `next(e)` so the prompt enters as typed. Every non-success branch (gate aside) funnels through it: `!isAnswered`, empty reply, guard failure, oversized reply.

**Layout follows `session-bar`.** `plugins/prompt-polish/` with the five files plus `tsconfig.json`; `types/index.d.ts` declares `PluginState['prompt-polish']` as `{ enabled: boolean; held?: { original: string; polished: string } | null; armed: boolean }`. Found during implementation: `$.state.set` refuses `undefined` as a value (JSON data only), so a cleared draft is written as `null`, and `held` is `null` or unset when nothing is held; readers treat both the same. Pure helpers (`gate`, `spans`, `preserves`, `added`, `trimContext`, `buildPrompt`) are exported for tests.

## Risks / Trade-offs

- [The empty-box digit convention may apply only to engine surveys, not to any band Button] → Verify in the first UI test; if a plugin Button is not pressed by a bare digit, the band text changes to "ctrl+x tab, then 1" and `/polish restore` remains, both already specified.
- [`prompt.submit` might fire for a `/command` line in some path] → The gate also passes through single-line text starting with `/` or `!`; a test asserts no model call for such input.
- [haiku rewrites more than asked despite the system prompt] → The guard catches technical damage; a length cap (polished longer than 1.5× original plus 80 characters is discarded) catches template-like expansion; the trailing-question rule is checked in tests by prompt tuning, not code.
- [Latency on a slow connection exceeds the 8s bound] → The timeout path restores the original within the bound; the user presses Enter once more. The bound is a constant that can later become a `userConfig` field.
- [The notice line on every polished prompt adds transcript noise] → It is the engine's drop notice, one line, and it carries the restore instruction; accepted for v1. A later version can rely on the band alone if the engine allows a silent drop.
- [Session state and the band are per session; parallel sessions each pay one completion per prompt] → Expected and within the stated cost constraint; nothing is shared except the on/off default.
- [The user clears the box intending to type something new, and the band still offers restore] → Harmless: typing anything hides nothing, the band only reacts to a bare digit in an empty box; once the new text is submitted and polished, `held` is replaced.

## Migration Plan

1. Build the plugin under `plugins/prompt-polish/` on a branch; validate, type-check and test with the plugin tooling; try it live through the dev-mods hot-reload folder or `claude --plugin-dir`.
2. Add the manifest entry and README line; commit; push `main`.
3. On this machine: `claude plugin marketplace update plugins`, then `claude plugin install prompt-polish@plugins`. Each parallel session picks it up on its next start.
4. Rollback: `claude plugin uninstall prompt-polish@plugins`, or `/polish off` for a session. Nothing outside the plugin's own store is written.

## Open Questions

- Whether the user's global `~/.claude/CLAUDE.md` should join the project file in the context block. Deferred: it changes only the `trimContext` input list, not the specs or tasks, and can be decided after a week of use.
