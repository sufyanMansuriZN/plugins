# Proposal

## Why

The row is one run of segments joined by ` · `, so the parts that name the session (branch, agent, model) and the meters that count usage read as one list. The row also never says which repo the session is in. Two sessions in two repos on `main` look the same.

## What Changes

- The row has two zones. The left zone names the session: the repo, the branch with its counts, the subagent in view and the model. The right zone holds the context and the usage windows, at the right edge of the band.
- A new first segment on the left names the repo. In a git worktree, it is the name of the main working tree, so a worktree shows the repo's real name and not the worktree folder. Outside a git repo, it is the name of the session's directory.
- At least 3 cells stand between the zones. The rest of the free room goes between them, so the right zone keeps its place at the band's edge.
- When the band is narrow, the parts go in this order: the branch is cut to 12 cells, the meters go, the words go, the branch is cut further, the branch goes, and then the repo name is cut. The agent, the model and the gauges are never cut.
- The segments in each zone keep the dim ` · ` between them, and the badge colors do not change.
- Same on the terminal and the desktop surfaces. Version stays 3.1.0, which is not yet released.

Builds on `session-bar-pace-meter`, which is not archived yet. This change's blocks for One row above the prompt and Row fits the terminal start from that change's text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-bar`: the row has a left zone and a right zone (One row above the prompt), and a new shedding order across both zones (Row fits the terminal). A new requirement adds the repo name segment.

## Impact

- `hooks/bar.ts` (the two zones and the fit), `hooks/register.tsx` (the `where` state, the repo read and the two-zone layout), `types/index.d.ts` (the `where` state), both test files.
- The plugin README describes the two zones and the new shedding order.
- One new state key, `where`. One new engine call, `$.session.repo()`, beside `$.session.cwd()`. No new permissions.
