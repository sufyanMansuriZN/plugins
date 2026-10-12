# Tasks

## 1. Stop the fetch bookkeeping redraw

- [x] 1.1 In `refreshUsage`, delete the `fetchedAt` atom; gate on `$.store.get('fetchedAt')` and set it with `$.store.set`, with no `$.state` write. Verify: `grep fetchedAt plugins/session-bar/hooks/register.tsx` shows only `$.store` calls, and a refresh leaves no `fetchedAt` in `$.state`.
- [x] 1.2 Add a test in `register.test.ts`: a refresh whose limits equal the last causes no redraw, and a second refresh inside 5 minutes does not fetch. Verify: the test fails on 0.14.3 code and passes now.
- [x] 1.3 Run `claude plugin test .` and `bunx --bun tsc --noEmit -p .` from `plugins/session-bar`. Verify: both pass.

## 2. Experiment: pills without `isInteractive` (0.14.4)

- [x] 2.1 Remove `isInteractive` from the pill `Svg` in the Desktop branch of `ui.render`; keep `alt={badge.tip}`. Update any pill test that expects the prop. Verify: the terminal branch diff is empty, and `claude plugin test .` and `tsc --noEmit` pass.
- [x] 2.2 Bump `plugin.json` to 0.14.4, commit and push, run `claude plugin update session-bar`, restart Desktop. Verify: `/plugin` shows 0.14.4.
- [x] 2.3 User check on Desktop, two separate checks: send a prompt, then let a turn finish. Report for each: flicker stops, lessens, or stays. Also report whether hovering a pill shows anything. Verify: both answers recorded in this file under task 3.

## 3. Decide from the result

- [x] 3.1 Record the result of 2.3 in design.md, replacing the open question about `alt` and picking the branch in decision 3.
- [x] 3.2 If hover was the cause: with the user, choose steady bar with no hover, hover on the 5h pill only, or another way to reach the countdown. Write the delta for "Desktop pill hover" in `specs/session-bar/spec.md` (MODIFIED, or REMOVED with Reason and Migration) and make the matching code and test changes. Verify: `openspec validate session-bar-desktop-flicker-on-turn --strict` passes, tests and `tsc` pass, and the user confirms on Desktop.
- [x] 3.3 (Not applicable: hover was the cause.) If hover was not the cause: restore `isInteractive`, re-run tests and `tsc`, release the restore, and add a note to design.md that Desktop re-renders regardless. Replace the "Pending after the experiment" section of the spec delta with nothing. Verify: hover shows the countdown again on Desktop.
- [x] 3.4 Remove the "Pending after the experiment" section from `specs/session-bar/spec.md` in this change. Verify: `openspec validate session-bar-desktop-flicker-on-turn --strict` passes.

## 4. Always show the Desktop bar

- [x] 4.1 Make `desktopSegments` return every badge, not `[]` while calm; update the tests that expect nothing while calm (the `desktop: nothing while calm` unit test and the `desktop mount` test's `n` of 0) to expect neutral pills. Verify: `claude plugin test .` passes, and a test finds neutral pills for a calm reading, none for an absent context, and none for an expired 5h window.
- [x] 4.2 Run `bunx --bun tsc --noEmit -p .` and the full test file. Verify: both pass.
- [x] 4.3 Hot-swap `register.tsx` into the installed copy as before and restart Desktop. Verify on screen: neutral pills show above the prompt with the calm readings. Do this before the flicker check in 2.3.

## Workflow follow-up

- Tick task 3.2 of `session-bar-desktop-icons` if this change settles the flicker, then archive both changes.
- Archive this change after 3.4 and the user's Desktop confirmation.
