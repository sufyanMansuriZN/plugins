# Design

## Context

`hooks/bar.ts` is a pure core. `segments(input, columns)` returned one `Segment[]`: git, agent, model, ctx, then the windows. It took the first rung of the `DETAILS` ladder (meters and words, words only, bare) whose gauges fit beside up to 12 cells of git, then cut git into the room left. `hooks/register.tsx` joined the segments with dim ` · ` runs in one row `Box`. The archived change `2026-10-16-session-bar-tui-two-zones` had a two-zone row with the same render layout. A later rebuild dropped it.

## Goals / Non-Goals

**Goals:**
- Name the repo, so two sessions on the same branch in two repos look different.
- Keep what names the session apart from what counts usage, with the meters at a fixed place on the right edge.
- Keep `segments` pure and the shedding order in tables, not in a chain of conditions.

**Non-Goals:**
- No change to what a gauge shows, to the badges or to their colors. The gauges get no ink.
- No owner or remote in the repo name. The folder name of the repo root is enough.
- No padding computed from `bodyColumns` in the render.

## Decisions

**`where` is plugin state, read with git.** A new atom `where: string | null` holds the name. `refreshRepo` (renamed from `refreshGit`, since it now reads both) runs at session start, at each turn's end and every 30 seconds. It reads `$.session.repo()`. When that is non-null, the name is the last part of `repo.root`, which is the main working tree for a worktree. When it is null, the name is the last part of `$.session.cwd()`. The atom is written only when the name changes, as git is. When either call fails, the atom keeps its last value, which starts as null.
- *Why not `$.session.root()`.* Its typings say a worktree move takes it to the worktree, so in a worktree it names the worktree folder, not the repo.
- *Why keep the last value on an error.* A repo's name does not change in a session. Clearing it on one failed read would make the left zone jump.

**`segments` returns `{ left, right }`.** `BarInput` gains `where`. The left zone is a list of names, each `{ key, text, tone }`, in the order where, branch, agent (dim), model. The right zone is ctx and the windows, made as before. The render draws each zone's segments joined by dim ` · ` runs.

**The branch sits in parentheses beside the repo name.** After the fit, `joinBranch` puts where and branch in one segment, `plugins (main +3 ~2)`, with ` (` and `)` as dim runs. The two runs take 3 cells, the same as the ` · ` they replace, so the fit counts names and separators as before and needs no change. A cut branch stays inside the parentheses (`plugins (f…)`). A branch that is left out takes them with it. A branch without a where shows bare.
- *Why after the fit.* The cut and shed work on plain names. Joining before them would make the branch's cut reach into the parentheses.

**The branch carries an ink, in robbyrussell's colors.** A `Run` may name an `Ink`: `paren` or `branch`. The git name is split after the fit, so its first cells (the branch's length, or less after a cut) are `branch` and the rest plain. The render maps each ink on the terminal to a named ANSI color: bold blue, red.
- *Why the repo name and counts are plain.* Measured against the user's Ghostty themes, robbyrussell's cyan is 2.14:1 and yellow 1.85:1 on `iTerm2 Light Background`; red is 5.77:1 and blue 10.04:1. On `iTerm2 Tango Dark` all four are above 4.1:1. The user compared both options live and chose to keep only the two that pass on light. The terminal's theme sets those colors for light and dark, so the rule that fixed colors live only on badges still holds. On the desktop, the render draws no ink and uses the run's tone: plain names and dim parentheses.
- *Why an ink and not a color in the core.* The core says what a run is. Each surface decides what that looks like, so the desktop can refuse the colors without a second code path in `segments`.
- *Why no ink on the desktop.* The desktop has no theme palette behind a name such as `cyan`, so it would draw a fixed color, and cyan on a light background is close to unreadable. This is from the typings ("what a surface draws for one it does not know is its own"), not from a live check.

**One `GAP` for the fit and the render.** `GAP = SEP.length` (3). The fit counts `GAP` before a non-empty right zone. The render draws the right zone in a `Box` with `marginLeft={GAP}`, and only when it has segments. The left zone is in a `Box` with `flexGrow={1}`, so it takes the free room and the right zone sits at the band's right edge. Both use the same constant, so a row that the fit accepts at exactly `bodyColumns` does not wrap.
- *Alternative: a run of spaces of `columns - width(left) - width(right)`.* Rejected, as in the archived change: it needs a known width in the pure core, and a resize between render and paint makes the row too long.

**The fit is two tables.** `KEEPS` says how many cells a name keeps while the right zone still has meters or words to give up: the branch keeps 12, the others keep all. `SHEDS` lists the names that give up cells after the last rung, first one first: branch, then where.
1. The right zone takes the first `DETAILS` rung whose width, plus `GAP`, fits beside the left zone at its `KEEPS` widths.
2. The left zone gets the room that is left. For each name in `SHEDS`, while the left zone is too wide, that name is cut to fit and ends with `…`. A name with fewer than 2 cells of room is left out, with its ` · `.
- The agent and the model are not in `SHEDS`, so they are never cut, like the gauges.
- *Alternative: per-name `if` branches.* Rejected: a new name or a new step in the order is one table entry here.

## Risks / Trade-offs

- [The repo name takes about 10 more cells on the left] -> On a narrow band, the meters go sooner than before. The order still keeps the meters over a long branch name.
- [A band narrower than the agent, the model and the bare gauges] -> The row is wider than the band and wraps, as before. Nothing more can be shed.
- [`flexGrow` and `marginLeft` on the desktop surface] -> The test kit accepts the tree on both surfaces. How the desktop app paints it is still to check live.
- [A worktree outside the repo's folder tree] -> `repo.root` still names the main working tree, so the name is right.

## Migration Plan

No release yet: version 3.1.0 is still unreleased and ships with `session-bar-pace-meter`. The new `where` state starts as null and fills on the first refresh. Rollback is the previous release.
