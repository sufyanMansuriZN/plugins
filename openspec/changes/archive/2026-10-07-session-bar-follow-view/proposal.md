# Proposal

## Why

When the person opens a subagent's transcript from the tasks list, the session bar still names the main loop's model and shows the main loop's context, so a Haiku `Explore` agent reads as `Opus 5.5 1M` with 187K of context. The engine already re-renders the band with the transcript in view (`e.props.view.agentId`); the bar ignores it.

## What Changes

- The bar follows the transcript in view: with a subagent's transcript open, the model segment names the model that subagent runs on, preceded by its agent type (`plugins · Explore · Haiku 4.5`).
- The subagent's model is learned from its model requests as they happen, recorded per agent id. Until its first request, the model segment shows the type alone rather than the main loop's model.
- A subagent's model label carries no window size taken from the main loop's context reading (only the `[1m]` the id itself names).
- The context segment is hidden while a subagent's transcript is in view: the only context reading the engine pushes is the main loop's.
- Usage windows (5h, 7d, per-model weekly) are account-wide and stay as they are in every view.
- With the main conversation in view, the bar is unchanged.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-bar`: the bar adds a requirement to follow the transcript in view; `Model label` gains the subagent case (type before the model, no main-loop window, type alone before the first request); `Context size` is hidden while a subagent is in view.

## Impact

- `plugins/session-bar/hooks/register.tsx`: a `turn.step` observer (and an `agent.spawn` one for an early reading) writing an agent-id-to-model atom; the `AbovePrompt` render reads `e.props.view`, and `$.agent.list()` only while a subagent is in view; `BarInput` gains the agent type.
- `plugins/session-bar/types/index.d.ts`: the new atom's state key.
- `plugins/session-bar/hooks/register.test.ts`: layout and label cases for the subagent view.
- Plugin version bump (0.8.2 -> 0.9.0) and marketplace publish.
