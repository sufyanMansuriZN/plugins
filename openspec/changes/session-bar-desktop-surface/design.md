# Design

## Context

The hook in `plugins/session-bar/hooks/register.tsx` builds `Run[]` (`segments`, `layout`) and draws them with `$.ui.resolve(e)`. It never reads `e.surface`. `AbovePrompt` is raised on terminal and desktop only. See proposal.md for why Desktop needs its own presentation. The pure helpers (`paceBand`, `ctxBand`, `countdown`, `tokensText`, `fresh`) are surface-neutral.

## Goals / Non-Goals

**Goals:**
- One hook, branching on `e.surface`; terminal output byte-for-byte unchanged.
- Desktop pill that needs no Nerd Font and no cell grid.
- Desktop logic testable with `$.ui.mount({ surface: 'desktop' })`.

**Non-Goals:**
- A `Client` module or `Svg` drawing for Desktop.
- vscode and mobile. `AbovePrompt` is not raised there, so nothing changes.
- Caching the git branch (the existing `shortcut:` stays). Desktop does not use the branch, so skip the git call there.

## Decisions

1. **Branch on `e.surface`, not `$.session.surfaces()`.** The hook already receives `e`, and a session on terminal and Desktop at once gets one ask per surface. Alternative: `surfaces()` once at start. Rejected: it cannot tell which surface this draw is for.

2. **Desktop builds from a separate `desktopSegments(b)`, not flags on `segments`.** The two share only the level logic, and a flag per omitted segment would clutter `segments`. It reuses `pace`, `ctxBand`, `countdown`, `tokensText`. Alternative: a `surface` argument to `segments` and `layout`. Rejected: tier logic does not apply on Desktop.

3. **No width tiers on Desktop.** `bodyColumns` is a cell count and Desktop's value put the screenshot in the no-bar tier. With attention-only text pills the row is short, so `layout` is skipped.

4. **Pill without Powerline caps.** Use a `Text` with `backgroundColor` and padding spaces (the existing `ATTN` colors and dark text). Alternative: a `Box` with `borderRadius`. Confirmed in the types: `Box` has `borderStyle`, `backgroundColor` and padding but no `borderRadius`, and `Text` has `backgroundColor`. So the pill is one `Text` run set with `backgroundColor` and a space of padding each side.

5. **Desktop pill content is `label value [countdown]`**, e.g. `5h 71% 3h`, `ctx 187K`. The ctx bar and its warn tick are terminal-only.

6. **Return `next(e)` alone when there is nothing to add.** Desktop with no attention segment skips the wrapping `Box`, so no empty band shows. This is the normal calm case.

7. **Subagent view on Desktop:** same as terminal rules for ctx (hidden); the agent type is not drawn (assumption: Desktop's task list names it). Revisit if it reads as a loss.

## Risks / Trade-offs

- [Desktop `Text` may not render `backgroundColor` as expected] → verify in the live app; fall back to the terminal-style pill glyph-free form.
- [A calm Desktop shows nothing, so the user may think the mod is off] → accepted: a pill appearing is the signal. The terminal bar is unchanged. Say so in the README if it confuses.
- [`e.surface` value for Desktop may differ at runtime from the types] → the mount test names `desktop`; check once live.
- [`$.process.run('git')` per redraw] → already a known shortcut; Desktop may redraw as often as the terminal.
