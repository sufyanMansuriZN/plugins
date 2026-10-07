# Spec Delta

## ADDED Requirements

### Requirement: Bar follows the transcript in view
The bar SHALL describe the loop whose transcript is on screen. With a subagent's transcript open from the tasks list, the directory segment SHALL be followed by that subagent's agent type and then its model segment. Switching back to the main conversation SHALL restore the main bar. Usage windows SHALL show in every view, since they belong to the account.

#### Scenario: Subagent in view
- **WHEN** the person opens the transcript of an `Explore` subagent whose requests name `claude-haiku-4-5-20251001`
- **THEN** the bar starts `plugins · Explore · Haiku 4.5`

#### Scenario: Back to main
- **WHEN** the person returns from a subagent's transcript to the main conversation running `claude-opus-5-5` with a 1,000,000-token window
- **THEN** the bar starts `plugins · Opus 5.5 1M` and shows the context segment again

#### Scenario: Usage windows in a subagent's view
- **WHEN** a subagent's transcript is in view and the 5h window reads 41% used
- **THEN** the 5h segment shows as it does in the main view

## MODIFIED Requirements

### Requirement: Model label
The model segment SHALL show the model's name and version (e.g. `Opus 5.5`) followed by the context window size once the session has a context reading (e.g. `Opus 5.5 1M`). Before that, it SHALL show `1M` only when the model ID names the 1M window (`[1m]`). For a subagent in view, it SHALL name the model of that subagent's latest model request, with `1M` only when that model ID names it, and SHALL be left out until the subagent has made a request.

#### Scenario: Window from the context reading
- **WHEN** the model ID is `claude-opus-5-5` and the context reports a 1,000,000-token window
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: A 200K window
- **WHEN** the model ID is `claude-haiku-4-5-20251001` and the context reports a 200,000-token window
- **THEN** the model segment shows `Haiku 4.5 200K`

#### Scenario: No reading yet
- **WHEN** no response has landed and the model ID is `claude-opus-5-5[1m]`
- **THEN** the model segment shows `Opus 5.5 1M`

#### Scenario: Subagent takes no window from main
- **WHEN** a subagent in view runs `claude-sonnet-5-5` and the main loop's context reports a 1,000,000-token window
- **THEN** the model segment shows `Sonnet 5.5`

#### Scenario: Subagent before its first request
- **WHEN** a `Plan` subagent's transcript is in view and it has made no model request yet
- **THEN** the bar starts `plugins · Plan` and names no model

### Requirement: Context size
The context segment SHALL show the context's input tokens (e.g. `187K`), labelled `ctx`. It SHALL turn orange from 150K tokens, and vermillion from the lower of 250K tokens and 80% of the window. It SHALL be hidden until the session has a reading, and hidden while a subagent's transcript is in view.

#### Scenario: Comfortable on a 1M window
- **WHEN** the context holds 120,000 tokens of a 1,000,000-token window
- **THEN** the context segment shows `ctx`, a bar and `120K`, as plain text

#### Scenario: Past the compaction point on a 1M window
- **WHEN** the context holds 187,400 tokens of a 1,000,000-token window
- **THEN** the context segment shows `187K` in an orange pill

#### Scenario: A 200K window caps the red threshold
- **WHEN** the context holds 170,000 tokens of a 200,000-token window
- **THEN** the context segment shows `170K` in a vermillion pill

#### Scenario: Fresh session
- **WHEN** no response has landed yet
- **THEN** no context segment is drawn

#### Scenario: Subagent in view
- **WHEN** a subagent's transcript is in view and the main loop's context holds 187,400 tokens
- **THEN** no context segment is drawn
