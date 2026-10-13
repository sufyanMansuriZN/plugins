# Tasks

## 1. Snowflake

- [x] 1.1 Replace `CACHE_GLYPH.cold` in `plugins/session-bar/hooks/register.tsx` with the 12 Tabler outline `snowflake` paths (`@tabler/icons` `icons/outline/snowflake.svg`, without its `stroke="none"` box path); verify a test that the cold pill source contains `M12 2v6.5l3 1.72` and not the old `M12 3v18`

## 2. Shared glyph drawer

- [x] 2.1 Move the pill's `<g>` glyph markup into a module-level drawer and have `pill()` call it; verify every existing pill test passes unchanged and a pill source is byte-identical before and after (snapshot one pill string first)
- [x] 2.2 Add `icon(paths)`: a standalone `Svg` source, `ICON + 7` wide and `ICON` high, glyph at x 0, dim ink class, with the pills' ink `<style>`; verify a test that its `<g>` has the same transform scale, stroke width and class as a calm pill's icon

## 3. Usage block icons

- [x] 3.1 Carry the cache state on the context `UsageRow` (beside `line2`); verify `usageRows` tests for warm and cold still pass and the row carries the state
- [x] 3.2 Draw `icon(GLYPH[r.kind])` before each row name in both layouts, `flexShrink={0}`, the name keeping `wrap="truncate-end"`; verify a mount test that each row holds one icon `Svg` before its name, at 2 rows and at 1 row per line
- [x] 3.3 Draw `icon(CACHE_GLYPH[state])` before the cache line, and no icon on other lines; verify a mount test that only the cache line has an icon and it matches the pill's glyph for warm, soon and cold
- [x] 3.4 Run `claude plugin test` for session-bar and `tsc`; verify both are clean

## 4. Match the approved mockup (found in the live check)

- [x] 4.1 Give each row icon a non-empty alt naming its pill (Desktop drew nothing for `alt=""`); verify the mount tests read `context pill`, `5h pill`, `7d pill` and `cache <state>`
- [x] 4.2 Icons at 15px with a 1.5px stroke for pills and rows; row icons in the mockup's accent blue, 2px gap in their box, 1px up; pill icons in the primary ink; verify tests for the shared `<g>`, the `sb-a` class and `translate(0 -1)`
- [x] 4.3 Pills as the mockup: 24px high, 10px sides, 5px between icon, label and value, 12px text, a neutral hairline; verify the pill and tier tests, and that `desktopTier` still picks a tier at 161, 95, 55, 44 and 33 cells
- [x] 4.4 Meters 6px on a plain gray track, the fill solid, the darker time-gone shadow behind it; verify the meter test
- [x] 4.5 The open block as a card (inverse ground, round border, padding) and 1 cell above the pills; verify by eye live on a light theme, the user approving the look
- [x] 4.6 Run `claude plugin test` and `tsc`, and sync the worktree code to the dev copy; verify 37/37 pass, `tsc` clean, the two copies identical

## 5. Live check and release

- [x] 5.1 In the hot-reloaded dev-mods copy, check on Desktop: a dark theme (card ground, blue icons, meters), a narrow window (1 row per line, a cut name keeps its icon), the snowflake once cold, and no flicker on send with the block open
- [x] 5.2 Sync the spec delta into `openspec/specs/session-bar`, bump `plugin.json` to 0.18.0, release (commit, push, `claude plugin update session-bar`), remove the dev-mods copy, re-enable the installed plugin, and verify `claude plugin test` passes and a new session shows the bar

## Workflow follow-up

- Archive the change after the live check passes.
