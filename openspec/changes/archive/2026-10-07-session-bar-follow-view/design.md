# Design

## Context

The `AbovePrompt` render reads `$.session.model()` and the `ctx` atom, both of which describe the main loop only (`ctx` is fed by `session.measure`, which carries no `agentId`). The band's props already carry `view: SiteView` (`{ agentId? }`), and a view switch re-runs the band's `ui.render` hooks. `AgentInfo` from `$.agent.list()` has `type` and `name` but no model, so the model of an agent has to be recorded as it runs.

## Goals / Non-Goals

**Goals:**
- A subagent's real model and type on the bar while its transcript is in view, at no cost to the main view's render.

**Non-Goals:**
- A context reading for a subagent. Estimating it from `$.session.messages({ agentId })` is costly and approximate; the segment is hidden instead (see specs).
- Persisting agent models across sessions or reloads.
- Changing width tiers: the `dir · type · model` group is never dropped, as `dir · model` is not today.

## Decisions

**Model from `turn.step`, keyed by agent id.** An observer on `turn.step` writes `e.model` into an atom `agentModels: Record<agentId, modelId>` when `e.agentId` is set, then returns `next(e)` untouched. It names the model each request actually used (a fallback included), and it fills in agents already running when the mod reloads.
- *Alternative: `agent.spawn`'s resolved `{ model, agentId }`.* Fires once and earlier, but misses agents started before a reload and any spawned past this hook by another plugin's `$.agent.spawn`. Kept only as an optional early write (task 2.2); `turn.step` is the source of truth.
- The atom is written only when the value changes, so a long subagent run does not re-render the band on every step.

**Type from `$.agent.list()`, only in a subagent view.** The render calls it only when `e.props.view.agentId` is set, and finds the entry by `id`. Label is `type`, falling back to `name`, then omitted. The main view's `Promise.all` stays as it is.
- *Alternative: record type at `agent.spawn` in the same atom.* Saves a call but has the same reload gap; the list is in-memory and cheap.

**`BarInput` gains `agent?: string`; `ctx` passed as `undefined` in a subagent view.** `segments()` draws the first group as `dir`, ` · agent` (dim) when set, ` · model` (dim) when set. Hiding the context segment needs no new branch: `segments()` already skips it when `ctx` is absent.

**Label without the main window.** In a subagent view the model is labelled with `modelLabel(id)` (no window argument), so only an id's own `[1m]` adds `1M`.

**Unknown model shows no model.** Before the subagent's first `turn.step`, `agentModels[id]` is absent and the bar shows `dir · type`. Falling back to `$.session.model()` would show the main loop's model, which is the bug this change fixes.

## Risks / Trade-offs

- [`turn.step` is a streaming hook on every model request, main's included] -> The hook does one map lookup and an atom write only on change, then returns `next(e)`; main's steps (no `agentId`) return at once.
- [The atom grows with every subagent in a long session] -> One short string per agent; no pruning needed at session scale.
- [An agent whose `$.agent.list()` entry is gone (finished and dropped) while still in view] -> Type is omitted; the model still shows from the atom.
- [Teammates' `type` is not their role name] -> Fall back to `name`, which is what a teammate is addressed by.

## Migration Plan

Ships as session-bar 0.9.0 through the marketplace; a reload picks it up. Rollback is reinstalling 0.8.2. No stored data changes shape.
