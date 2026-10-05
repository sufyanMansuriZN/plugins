# Spec Delta

## Purpose

A pre-send step inside the Claude Code CLI that, on the user's gesture, polishes the draft in the prompt box into a clearer version of the same request and leaves it there for review, guaranteeing that Enter is never intercepted, that nothing reaches the agent without the user's own Enter, that the transcript shows nothing of it, and that no failure ever loses the draft.

## ADDED Requirements

### Requirement: Polish on a gesture, never on Enter
When polishing is on, the system SHALL polish the draft in the prompt box only when the user asks for it: with the polish chord, with the band's polish choice, or with the `/polish` command. It SHALL NOT intercept, hold or drop a submitted prompt, and SHALL NOT write anything to the transcript. The polished text SHALL replace the draft in the prompt box with the cursor at its end, and the user's next Enter SHALL send whatever the box holds as any other prompt.

#### Scenario: Draft polished in place
- **WHEN** polishing is on, a task-like draft is in the box and the user presses the polish chord
- **THEN** the box shows the polished text with the cursor at its end, no turn starts, and the transcript shows no new line

#### Scenario: Reviewed draft is sent as-is
- **WHEN** a polished draft is in the box and the user edits it or leaves it and presses Enter
- **THEN** exactly that text enters the session and the turn starts, with no notice in the transcript

#### Scenario: Enter without a polish
- **WHEN** polishing is on and the user presses Enter on a draft without having pressed the chord
- **THEN** the draft enters the session untouched, with no model call and no notice

### Requirement: The chord
The polish chord SHALL be the chord the user has bound to the engine action `app:diffFileListDown` (ctrl+↓ or alt+↓ by default), delivered through a band Button carrying that action, so that rebinding the action moves the chord. The band SHALL name the chord. The same Button SHALL also be reachable with the band's focus chord followed by its digit, and by a click. Users MAY bind any chord to `command:polish` in their own keybindings file as a dedicated key.

#### Scenario: Default chord
- **WHEN** a task-like draft is in the box, the diff panel is closed and the user presses ctrl+↓
- **THEN** the draft is polished

#### Scenario: Focus chord and digit
- **WHEN** a task-like draft is in the box and the user presses `ctrl+x tab` then `1`
- **THEN** the draft is polished

#### Scenario: Keybound command
- **WHEN** the user has bound a chord to `command:polish` and presses it with a draft in the box
- **THEN** the draft is polished if the engine leaves the draft in the box for the command, and otherwise the status output says how to polish

### Requirement: Light-touch polishing
The polished text SHALL be the user's request in the user's own order and voice, with grammar and clarity fixed and Hindi or Hinglish translated to English. It MAY add a short clause making explicit something the user clearly implied, drawn from the original text, the recent conversation or the project's instruction file. It SHALL NOT restructure the prompt into a template, SHALL NOT exceed roughly one and a half times the original length, and SHALL NOT add a requirement, constraint or scope the user did not have.

#### Scenario: Hinglish prompt
- **WHEN** the user polishes a draft that mixes Hindi and English
- **THEN** the polished text is in English, says the same thing, and keeps the same sentences in the same order

#### Scenario: Implied scope made explicit
- **WHEN** the recent conversation establishes which file or feature the user is working on and the draft refers to it only as "it" or "that"
- **THEN** the polished text names the file or feature where the pronoun was, and adds nothing else

#### Scenario: No invented requirements
- **WHEN** the original says nothing about tests, performance, style or compatibility
- **THEN** the polished text says nothing about them either

### Requirement: Flagging genuine ambiguity
When something important to the request cannot be resolved from the original text or the available context, the polished text SHALL end with one short line of its own, in the user's voice, naming that one open point. It SHALL NOT add such a line when nothing important is unclear, and SHALL NOT ask more than one question.

#### Scenario: Ambiguous target
- **WHEN** the draft says "fix the date bug" and the recent conversation mentions two unrelated date issues
- **THEN** the polished text ends with one line such as "not sure if you mean the parser or the formatter" and the user can delete or answer it before sending

#### Scenario: Clear prompt
- **WHEN** the draft and context leave nothing important unresolved
- **THEN** the polished text has no trailing question

### Requirement: Verbatim preservation of technical spans
Every span of code, file path, identifier, command, URL and error message present in the original SHALL appear unchanged in the polished text. If any such span is missing or altered, the system SHALL discard the polished text, leave the draft as typed, and say so in a transient notice outside the transcript.

#### Scenario: Backtick spans and paths survive
- **WHEN** the original contains `src/foo/bar.ts`, a backticked identifier and a pasted error line
- **THEN** each appears in the polished text character for character

#### Scenario: Model drops a span
- **WHEN** the model's reply omits or rewrites one such span
- **THEN** the box still holds the draft as typed, a toast says the polish was discarded, and the transcript shows nothing

### Requirement: Band shows the state and what changed
The system SHALL show a band above the prompt, laid out like the engine's own side-agent notice (a star, a dim tag, a lead line, then a row of numbered choices), in three states: a single-row hint, the tag and the numbered choices on one line with the chord in the polish choice's label, while a task-sized draft is in the box and nothing is held; "polishing…" while the model works; and, once a polish has landed, a review line with the choices restore (or use polished), polishing off, dismiss. While a polished draft is in the box and the user has not yet edited it, the system SHALL visually distinguish the text the polish added from the text the user wrote. The band SHALL draw nothing when the box is empty, when polishing is off, when a survey holds the band, or when the draft has been sent.

#### Scenario: Hint for a task-sized draft
- **WHEN** polishing is on and the user has typed a draft of six or more words that is not a command line or a bare acknowledgement
- **THEN** the band shows one row: the dim tag, `1: Polish draft (ctrl+↓)` and `2: Polishing off`, and nothing else; it draws nothing for a shorter draft or an empty box

#### Scenario: Added clause is highlighted
- **WHEN** the polished draft lands in the box
- **THEN** added words are painted in a distinct colour and the rest is plain

#### Scenario: Highlight clears on edit
- **WHEN** the user makes any edit to the draft
- **THEN** the highlight disappears and the text stays

#### Scenario: Band clears after send
- **WHEN** the draft is sent with Enter
- **THEN** the band draws nothing and `/polish restore` reports nothing to restore

#### Scenario: Band dismissed
- **WHEN** the user presses the dismiss choice
- **THEN** the band draws nothing, not even the hint, until the next edit to the box; the draft stays in the box and Enter sends it as typed

### Requirement: Restore the original
After a polish, the user SHALL be able to get the original text back into the prompt box with one gesture: the polish chord again, the band's first choice, or `/polish restore`. The chord SHALL swap between the original and the polished text while the box holds one of them unedited, and SHALL polish the current text afresh when the user has edited it.

#### Scenario: Chord swaps back
- **WHEN** the polished text is in the box unedited and the user presses the chord
- **THEN** the original text is in the box and the band's first choice reads "Use polished"

#### Scenario: Chord swaps forward
- **WHEN** the original is back in the box unedited and the user presses the chord
- **THEN** the polished text is in the box again with its highlight, without a second model call

#### Scenario: Chord on an edited draft
- **WHEN** the user has edited the polished draft and presses the chord
- **THEN** the edited text is polished afresh and becomes the new original to restore

#### Scenario: Command restore
- **WHEN** the user runs `/polish restore` while an original from this session is held
- **THEN** the original text is in the box and Enter sends it unchanged

### Requirement: Session toggle with a persisted default
The user SHALL be able to turn polishing off and on within a session with a `/polish` command, and the band SHALL offer an off choice in its hint and review states. The last explicit choice SHALL persist as the default for new sessions on the same machine. `/polish <text>` SHALL polish the given text into the box, and `/polish` with no argument SHALL polish the box when it holds text and otherwise report the state, the chord and how to bind a dedicated key.

#### Scenario: Turn off mid-session
- **WHEN** the user runs `/polish off`
- **THEN** the band draws nothing for the rest of the session, the chord does nothing, and every submission enters untouched

#### Scenario: Default carries over
- **WHEN** the user ran `/polish off` in one session and starts another
- **THEN** polishing is off in the new session until `/polish on` is run

#### Scenario: Status query
- **WHEN** the user runs `/polish` with no argument and the box is empty
- **THEN** the output states whether polishing is on or off, names the chord and the `command:polish` binding, and lists the arguments

### Requirement: Failure leaves the draft intact
If the model call fails, times out, returns no text, the preservation guard fails, the reply is too long, or the prompt box refuses the fill, the system SHALL leave the draft in the box exactly as typed, SHALL write nothing to the transcript, and SHALL say why in a transient notice.

#### Scenario: Model timeout
- **WHEN** the model does not answer within the configured bound
- **THEN** the box still holds the draft as typed, a toast names the timeout, and Enter sends the draft unchanged

#### Scenario: Box cannot be written
- **WHEN** the prompt box refuses the fill (a dialog holds the keys, or the session has no composer)
- **THEN** the draft is unchanged and a toast says the box could not be written

#### Scenario: Empty box
- **WHEN** the box is empty or blank
- **THEN** the band draws nothing, so the chord has nothing to press, and `/polish` reports the state without a model call

### Requirement: Bounded latency and cost
Each polish SHALL cost at most one small-model completion, bounded by a timeout of a few seconds, with context limited to the last few conversation messages and the head of the project's instruction file. A second press while a polish is running SHALL be ignored.

#### Scenario: Context stays small
- **WHEN** the conversation is long and the instruction file is large
- **THEN** the completion request carries only the last few messages' text, truncated per message, and a bounded head of the instruction file

#### Scenario: One call per polish
- **WHEN** the user presses the chord once
- **THEN** exactly one model completion is issued, and a press during it issues none
