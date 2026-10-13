# Design

## Context

`session.measure` gives the context's total input tokens only. `turn.complete` carries `usage` (`cache_read_input_tokens`, `cache_creation_input_tokens`) and `agentId` for a subagent's turn, but no TTL. The TTL is only in the transcript file: each assistant line's `message.usage.cache_creation` holds `ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens`, in either key order (seen live, 2026-10-13). The mod API exposes `$.fs`, `$.process.run` and `$.session.id()` (the transcript file's name). Desktop pills are non-interactive `Svg`; hover text comes from a surface reveal (decision 8). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Tell a person, while idle, when a large context stops being cheap to resend.
- No new redraws on Desktop beyond one per state change.

**Non-Goals:**
- Showing cache hit ratio or cached token counts.
- Keeping the cache warm (a keep-alive ping).
- A cache state for a subagent's loop.
- The context estimate before the first reply and the side pane (the other options from the mockups).

## Decisions

1. **One session atom, `cache: { endedAt, ttlMs } | null`.** `turn.complete` without `agentId` sets it; `prompt.submit` marks it `active` (read first: a write redraws). `null` (not `undefined`: state takes JSON) means no TTL known yet. Active shows as in use with the warm flame and no countdown, since each request restarts the TTL; an earlier version hid the state during a turn, which changed the pill's width twice a turn, and the person chose this. The state (active, warm, soon, cold) and time left are derived at draw time from `endedAt + ttlMs - now`. Alternative: store the state and update it on the tick. Rejected: two sources of truth.

2. **Turn end time is `$.clock.now()` at `turn.complete`.** The TTL restarts at the last request, which started before the turn ended, so the timer runs late by up to one request's length. shortcut: the "under 5 minutes" amber covers that; read the response's `timestamp` from the same transcript line if it proves too late.

3. **TTL from the last assistant line of the transcript.** `classic.Stop` never fired in a Desktop session (spike 1.1), so the path is `<HOME>/.claude/projects/<dir>/<$.session.id()>.jsonl`, the `<dir>` found by listing the projects folder and testing each for the file (15 ms over 30 dirs), not by rebuilding the folder name from the cwd. Found once per session and kept in a module variable. Parse lines with `JSON.parse` from the end until one has `message.usage.cache_creation`. 1 hour only when the 1h count is above 0 and the 5m count is 0, so a mixed write takes the shorter TTL. Any failure gives an unknown TTL and a hidden state. Alternative: a fixed TTL by plan. Rejected: the plan does not say which TTL the engine chose. Which path source works is the first spike.

4. **Read the last 64 KiB with `tail -c`.** `$.fs.read` refuses files over 4 MiB, and 70 of 1,423 local transcripts are over that, the large sessions this feature is for. `$.process.run(['tail', '-c', '65536', path])` read the tail in 5 ms (spike 1.1, a 1.5 MB file; `$.fs.read` took 6 ms there). The tail's first line is cut and fails to parse, which the line loop skips. `$.process.run` is already used for git.

Spike 1.1 results (2026-10-13): `turn.complete` without `agentId` fires for the main loop and carries `usage` with the cache split (`cache_read_input_tokens` 458,897, `cache_creation_input_tokens` 546) but no TTL; the transcript's last `cache_creation` read `{"ephemeral_1h_input_tokens":239,"ephemeral_5m_input_tokens":0}`, so the TTL was 1 hour.

5. **Desktop: a glyph, not a countdown or a color.** The spec keeps pills countdown-free and icons in the theme's ink, and the context pill already turns amber at 150K, so a cache color would be ambiguous. Shape carries the state: flame, hourglass, snowflake (Tabler outline paths, as the other icons). The minutes go in the pill's alt text and the usage block. Alternative: amber pill under 5 minutes (the mockup). Rejected: clashes with context warn.

6. **Terminal: `❄` with the countdown.** One narrow symbol (U+2744 without a variation selector) for all states; the text after it says which. Orange only under 5 minutes, since color means "look here". The countdown drops with the 5h countdown at the last tier.

7. **Redraw.** `minuteKey` gains the cache state always, and its countdown text only where one is drawn (terminal attached, or the usage block open), following the existing rule for usage countdowns.

8. **Hover text by a surface reveal, not an interactive Svg.** `isInteractive` flickered in 0.14.4 because the engine rebuilds an interactive Svg on every redraw. A keyed `Box` with `hover={{ display: 'flex' }}` on a hidden absolute child is applied by the surface: no hook runs and the plugin does not redraw. The typings say the child is clipped to the band, but Desktop drew it as a floating card above the band (spike 1.3, 2026-10-13: shown on hover, hidden on leave, no flicker over several prompts and turns). Alternative: the tip only in the usage block. Kept as the fallback if spike 1.3 fails. Touch surfaces have no hover, so the usage block stays the place that always shows the minutes.

9. **100K threshold.** Below it a cache miss costs little; a timer on every session is noise. A constant beside `CTX_WARN`.

## Risks / Trade-offs

- [The transcript format is internal and may change] → any parse failure hides the state; a test covers a missing field.
- [`CLAUDE_CONFIG_DIR` moves the projects folder] → shortcut: only `<HOME>/.claude/projects` is searched; a miss hides the state. Read `CLAUDE_CONFIG_DIR` from `$.env` if anyone sets it.
- [The timer runs late by one request's length] → amber at 5 minutes; see decision 2.
- [A hover reveal next to the Svg pills may still flicker, or Desktop may not hover a Box holding an Svg] → spike 1.3 before any code; fallback is the usage block line.
- [A mixed or changing TTL inside one session] → the last response decides, and the shorter TTL wins on a mix.

## Migration Plan

Develop in `~/.claude/dev-mods/<session>/session-bar/` with the installed plugin disabled, release as 0.17.0 through the marketplace, then re-enable. Rollback: `claude plugin update` to 0.16.0.
