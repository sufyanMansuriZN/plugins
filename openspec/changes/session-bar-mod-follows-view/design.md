# Design

## Context

session-bar 2.0.0 is a `statusLine` script. Its JSON has no field for the transcript in view, so a subagent's view shows the main loop's model. The `AbovePrompt` band's `ui.render` gets `e.props.view` and `e.props.bodyColumns`, and re-runs on a view switch. `$.agent.list()` gives an agent's `type` and `name` but no model. Each `turn.step` carries `agentId` (absent on main), the model the request names, and a result whose `usage` holds the token counts and the answering model.

## Goals / Non-Goals

**Goals:**
- The row of 2.0.0, drawn in the band, with the subagent's own type, model and context while its transcript is in view.

**Non-Goals:**
- A context percent for a subagent. The engine gives no window for an agent's loop, so its reading is a token count.
- Keeping agent readings past a reload or a session.
- A pane, buttons or any input on the band.

## Decisions

**Pure core, thin shell.** `hooks/bar.ts` holds the types and `segments(input, columns)`, with no `$`. It takes `BarInput = { git, agent, model, ctx, windows, now }` and returns `Segment[]`, a segment being runs of `{ text, tone }` (`plain`, `dim`, `yellow`, `red`). `hooks/register.tsx` gathers the input and maps tones to `Text` props. The ported statusline cases test the core directly.

**Parse at the boundary.** `parseGit` reads porcelain v2, `parseWindows` reads `SessionRateLimit[]` through one table `WINDOWS` of `[kind, label, length]`, and `stepTokens` reads a step's usage. Each drops what it cannot trust; the core trusts its types.
- `Ctx` is a union, `{ kind: 'percent' }` for the main loop and `{ kind: 'tokens' }` for a subagent, so a subagent cannot be colored against a window it does not have.

**Agents from `turn.step`.** A streaming hook records `agents[agentId] = { model, tokens }`: the model from the step's input as it starts, then the answering model and the input tokens from its result. It writes only when the record changes, so most steps write nothing.
- *Alternative: `agent.spawn`'s result.* Fires once, misses agents started before a reload, and has no tokens.

**State.** Three atoms under `session-bar`: `agents`, `git` (`Git | null`), and `tick`. `$.clock.every(30_000)` bumps `tick` and re-reads git, so countdowns move while idle. `session.measure` bumps `tick` too, since a render that reads `$.session.usage()` is not subscribed to it. Git is also read at `session.start` and `turn.complete`.

**Main view reads the engine.** `$.session.model()` and `$.session.usage()` give the model id, the window, the context percent and the rate limits. The model label adds the window size (` 1M`, ` 200K`) once; an id's own `[1m]` gives ` 1M` too.

**Subagent view.** The label is `AgentInfo.type`, or `name` for a teammate. The model is labelled without the main window. Until the agent has a step, both model and context are left out, because the main loop's would be wrong.

**Fit.** `bodyColumns` already leaves out the engine's own cells, so no margin is taken. Only git is cut, with `…`, and dropped below 2 cells.

## Risks / Trade-offs

- [`turn.step` runs on every model request] -> The hook compares and returns; it writes only on change.
- [A render calling `$.session.usage()` may lag a measure by one redraw] -> `session.measure` bumps `tick`, which redraws the band.
- [The band yields to surveys] -> `hasSurvey` passes to the engine, so the row is hidden while a survey shows.

## Migration Plan

Ships as 3.0.0 through the marketplace. People who ran `/session-bar:setup` on 2.x run `/session-bar:remove` once; until then they see the old row and the band. Rollback is reinstalling 2.0.0.
