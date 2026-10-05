# Spec Delta

## Purpose

A pre-send step inside the Claude Code CLI that polishes the user's typed prompt into a clearer version of the same request, puts it back in the prompt box for review, and guarantees that nothing reaches the agent without the user's own Enter and that no failure ever loses the original text.

## ADDED Requirements

### Requirement: Intercept before the turn starts
When polishing is on and a prompt is submitted from the composer, the system SHALL stop that prompt from entering the session, produce a polished version, and place it in the prompt box as the user's editable draft. The prompt SHALL NOT reach the agent until the user submits again.

#### Scenario: Rough prompt is held for review
- **WHEN** polishing is on and the user presses Enter on a task-like prompt
- **THEN** no turn starts, a one-line notice says the prompt is being polished, and the polished text appears in the prompt box with the cursor at its end

#### Scenario: Reviewed draft is sent as-is
- **WHEN** a polished draft is in the box and the user edits it or leaves it and presses Enter
- **THEN** exactly that text enters the session, unpolished a second time, and the turn starts

#### Scenario: Box emptied and a new prompt typed
- **WHEN** a polished draft is in the box, the user clears the box entirely, types a new prompt and presses Enter
- **THEN** the new prompt is treated as a fresh submission and is polished

### Requirement: Light-touch polishing
The polished text SHALL be the user's request in the user's own order and voice, with grammar and clarity fixed and Hindi or Hinglish translated to English. It MAY add a short clause making explicit something the user clearly implied, drawn from the original text, the recent conversation or the project's instruction file. It SHALL NOT restructure the prompt into a template, SHALL NOT exceed roughly one and a half times the original length, and SHALL NOT add a requirement, constraint or scope the user did not have.

#### Scenario: Hinglish prompt
- **WHEN** the user submits a prompt that mixes Hindi and English
- **THEN** the polished text is in English, says the same thing, and keeps the same sentences in the same order

#### Scenario: Implied scope made explicit
- **WHEN** the recent conversation establishes which file or feature the user is working on and the prompt refers to it only as "it" or "that"
- **THEN** the polished text names the file or feature where the pronoun was, and adds nothing else

#### Scenario: No invented requirements
- **WHEN** the original says nothing about tests, performance, style or compatibility
- **THEN** the polished text says nothing about them either

### Requirement: Flagging genuine ambiguity
When something important to the request cannot be resolved from the original text or the available context, the polished text SHALL end with one short line, in the user's voice, naming that one open point. It SHALL NOT add such a line when nothing important is unclear, and SHALL NOT ask more than one question.

#### Scenario: Ambiguous target
- **WHEN** the prompt says "fix the date bug" and the recent conversation mentions two unrelated date issues
- **THEN** the polished text ends with one line such as "not sure if you mean the parser or the formatter, ask if it matters" and the user can delete or answer it before sending

#### Scenario: Clear prompt
- **WHEN** the prompt and context leave nothing important unresolved
- **THEN** the polished text has no trailing question

### Requirement: Verbatim preservation of technical spans
Every span of code, file path, identifier, command, URL and error message present in the original SHALL appear unchanged in the polished text. If any such span is missing or altered, the system SHALL discard the polished text and put the original back in the box instead.

#### Scenario: Backtick spans and paths survive
- **WHEN** the original contains `src/foo/bar.ts`, a backticked identifier and a pasted error line
- **THEN** each appears in the polished text character for character

#### Scenario: Model drops a span
- **WHEN** the model's reply omits or rewrites one such span
- **THEN** the polished reply is not used, the original text is placed in the box, and the notice says the polish was discarded

### Requirement: Review shows what changed
While a polished draft is in the box and the user has not yet edited it, the system SHALL visually distinguish the text the polish added from the text the user wrote. While a draft is held, the system SHALL show a band above the prompt, laid out like the engine's own side-agent notice (a lead line saying the draft is polished and how to reach the choices, then a row of numbered choices: restore, polishing off, dismiss). The band SHALL go away when the draft is sent, dismissed, or polishing is turned off. The engine's one-line drop notice in the transcript stays short and points at the box.

#### Scenario: Added clause is highlighted
- **WHEN** the polished draft lands in the box
- **THEN** added words are painted in a distinct colour and the rest is plain

#### Scenario: Highlight clears on edit
- **WHEN** the user makes any edit to the draft
- **THEN** the highlight disappears and the text stays

#### Scenario: Band clears after send
- **WHEN** the held draft is sent with Enter
- **THEN** the band draws nothing and `/polish restore` reports nothing to restore

#### Scenario: Band dismissed
- **WHEN** the user presses the dismiss choice
- **THEN** the band draws nothing, the draft stays in the box, and Enter sends it as typed

### Requirement: Restore the original
The user SHALL be able to get the original text back into the prompt box with at most two gestures and no configuration. Restoring SHALL arm the next Enter to send the restored text as typed, without polishing it again.

#### Scenario: Digit restore
- **WHEN** a polished draft is in the box and the user presses `ctrl+x tab` then the restore digit shown in the band, or clears the box and presses that digit, or clicks the choice
- **THEN** the original text is in the box and Enter sends it unchanged

#### Scenario: Command restore
- **WHEN** the user runs `/polish restore` while an original from this session is held
- **THEN** the original text is in the box and Enter sends it unchanged

### Requirement: Session toggle with a persisted default
The user SHALL be able to turn polishing off and on within a session with a `/polish` command, and the band SHALL offer an off button while a draft is held. The last explicit choice SHALL persist as the default for new sessions on the same machine.

#### Scenario: Turn off mid-session
- **WHEN** the user runs `/polish off`
- **THEN** every later submission in that session enters the session untouched, and the band draws nothing

#### Scenario: Default carries over
- **WHEN** the user ran `/polish off` in one session and starts another
- **THEN** polishing is off in the new session until `/polish on` is run

#### Scenario: Status query
- **WHEN** the user runs `/polish` with no argument
- **THEN** the output states whether polishing is on or off and lists the arguments

### Requirement: Never intercept what is not a task
The system SHALL pass through, without a model call, any submission that is a short conversational reply, that was typed while a turn is running, that did not originate from the user's composer, or that carries non-text attachments.

#### Scenario: Short acknowledgement
- **WHEN** the user submits "yes, go ahead" or "haan kar do"
- **THEN** it enters the session immediately with no notice and no model call

#### Scenario: Prompt typed during a turn
- **WHEN** a turn is running and the user presses Enter on a prompt
- **THEN** it is queued or delivered exactly as Claude Code would without the plugin

#### Scenario: Non-composer origin
- **WHEN** a prompt arrives from a background task notification, a peer session, a schedule or another plugin
- **THEN** it is not intercepted

#### Scenario: Slash command or bash mode
- **WHEN** the user runs a `/command` or a `!` shell line
- **THEN** the plugin does not interfere with it

### Requirement: Failure leaves the original intact
If the model call fails, times out, returns no text, the preservation guard fails, or the prompt box refuses the draft, the system SHALL ensure the original prompt is not lost: either it enters the session directly or it is placed back in the box with the notice saying why.

#### Scenario: Model timeout
- **WHEN** the model does not answer within the configured bound
- **THEN** the original text is back in the box within that bound plus a moment, and Enter sends it unchanged

#### Scenario: Box cannot be written
- **WHEN** the prompt box refuses the fill (a dialog holds the keys, or the session has no composer)
- **THEN** the original prompt enters the session as if the plugin were not installed

### Requirement: Bounded latency and cost
Each intercepted prompt SHALL cost at most one small-model completion, bounded by a timeout of a few seconds, with context limited to the last few conversation messages and the head of the project's instruction file.

#### Scenario: Context stays small
- **WHEN** the conversation is long and the instruction file is large
- **THEN** the completion request carries only the last few messages' text, truncated per message, and a bounded head of the instruction file

#### Scenario: One call per prompt
- **WHEN** a prompt is intercepted
- **THEN** exactly one model completion is issued, and none when the gate passes the prompt through
