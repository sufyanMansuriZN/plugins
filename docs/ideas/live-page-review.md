# Live page review

## Problem statement

How might we let you mark up a page in your own Chrome and have the right Claude Code session act on each note right away? The session might have opened the page itself, or you might have opened it.

## Recommended direction

A small Chrome extension, loaded unpacked in your own profile, adds T3Code's annotation toolbar to the tabs under review. T3Code is MIT-licensed, and the port keeps its license notice. The toolbar runs as a content script, so the page's Content Security Policy does not apply to it. This is inferred, not tested. The extension does not use remote debugging or a localhost network request.

When you send a note, the extension passes it to a small local script through Chrome native messaging. The script appends the note to the notes file of the session that owns the tab. That session watches its own notes file with the Monitor tool, so the note starts a turn even when the session is idle. A spike on 2026-11-04 showed this works (see Spike results).

The local script owns the map from each tab to its session, and only the script writes it. A tab that a session opens belongs to that session. For a tab that you open, the toolbar shows a picker with the sessions that are watching, and you choose where its notes go. The tab keeps that choice when you reload or navigate.

The session fixes the code, reloads the tab, and takes a screenshot of the same marked area to show you the result. claude-in-chrome stays the tool for clicking, reading and screenshots. The extension only handles annotation and routing.

## Key assumptions to check

- [x] **A note can start a turn in a named idle session.** Yes, through a Monitor that the session runs. Channels are blocked by org policy. See Spike results.
- [x] **The content-script toolbar works on a strict-CSP site.** Yes on a GitHub pull request page. Shadow DOM, a `<style>` tag, adopted stylesheets and `innerHTML` all worked. See Spike results.
- [x] **Native messaging works on this machine.** Yes. A note went from the page to the host, into the notes file, and woke an idle session through its Monitor.
- [x] **The extension does not break paste or freeze tabs.** Accepted as true by the user on 2026-11-04 and not tested. If paste breaks or tabs freeze, suspect the extension first.
- [ ] **A session can claim the tab it opens.** For example, the session asks claude-in-chrome to open the URL, then registers the tab with the local script. Check that the tab ID that claude-in-chrome reports matches the ID the extension sees.

## MVP scope

In:

- The extension: a content script with the T3Code toolbar, plus a background worker that forwards notes to native messaging.
- The local script: the tab-to-session map, the session list from `claude agents --json`, and appending each note to the owning session's notes file.
- A toolkit tool or skill that opens a page for review, claims the tab, and tells Claude to start its Monitor.
- A session picker in the toolbar for tabs that you open.
- Each note carries the URL, section, text, selector and a cropped screenshot from `chrome.tabs.captureVisibleTab`.
- Checking each fix with a claude-in-chrome screenshot of the same marked area.

Out: everything in the next section.

## Not doing (and why)

- **Chrome remote debugging (CDP).** When it was turned on for the earlier annotate prototype, paste stopped working and tabs froze the next day.
- **Claude Code channels.** Blocked by org policy.
- **Copying cookies into a separate browser, as T3Code does.** Your real profile already has the logins.
- **Using Agentation.** It has one delivery queue with no routing, and its PolyForm Shield license is restrictive.
- **Publishing the extension to the Chrome Web Store.** Only you use it, so loading it unpacked is enough.
- **Preview tools that read `launch.json`.** Claude can already start a dev server with a background Bash command. Add these only if that proves slow.
- **An auto-verify hook after every edit.** The check after each note covers the loop you described.
- **Sharing with teammates.** Removed from the success criteria.
- **A preview pane in the terminal.** Your Chrome window is the preview.

## Spike results (2026-11-04, Claude Code 2.1.318, Haiku background sessions)

- **Channels are blocked.** `claude --bg … --mcp-config probe.json --channels server:probe` starts, but the session prints "--channels blocked by org policy (server:probe). Inbound messages will be silently dropped." Turning them on needs an admin to set `channelsEnabled: true` in managed settings. A `server:` entry also needs `--dangerously-load-development-channels`, and a plugin channel needs `allowedChannelPlugins`.
- **Session-to-session messages have no public entry point.** `claude agents` only lists and dispatches sessions. Sending into a session from outside would mean using internal daemon files, so this path is rejected.
- **A Monitor that the session runs works.** A background session ran `Monitor` on `tail -n 0 -F notes.jsonl` and ended its turn with "Watching.". Appending one JSON line to the file arrived as a `<task-notification>` Monitor event, and the idle session woke and answered it.
- **Costs of the Monitor path.** A Monitor expires after at most 30 to 60 minutes, so the session must start it again after it expires. That expiry also wakes the session. `claude agents` shows a watching session as `busy`. Claude has to start the Monitor itself, because a tool or hook cannot start one.
- **The extension path works end to end.** An unpacked MV3 extension with only `activeTab`, `scripting` and `nativeMessaging` was tested on a GitHub pull request page in the user's own profile, Chrome 150. The extension needed no access to any site in advance. A click on its toolbar icon injected the content script. Shadow DOM, a `<style>` tag, adopted stylesheets and `innerHTML` all worked. A click on the badge sent the note through native messaging to a Node host. The host appended it to `notes.jsonl`, and the watching session woke on the Monitor event within a second. `chrome.tabs.captureVisibleTab` returned a 234 KB PNG. claude-in-chrome registers its own native messaging host in the same folder, so it uses the same mechanism.
- **CDP was not tested.** Remote debugging is off in the running Chrome, and the user's earlier experience with it rules it out. The probe script stays in the session scratchpad and is not part of the design.

## Open questions

- How does a session start watching? The tool that opens a page for review can tell Claude to start the Monitor. For a tab that you open, the picker can only list sessions that are already watching.
- What happens to a tab's notes when its session ends? They could be held until you pick a new session, or dropped.
- Should notes from one tab queue up while the session is busy, or arrive as a batch?
- Which T3Code commit do we port from, so later updates can be compared?
- Does claude-in-chrome use the `chrome.debugger` API, and if so, does it cause the same paste problem? You use it today without that problem, which suggests it does not, but this is not checked.

## Sources

- [T3Code](https://github.com/pingdotgg/t3code): annotation UI in `apps/desktop/src/preview/Annotation*` and `apps/desktop/src/preview-pick-preload.ts`.
- [margin-notes](https://github.com/allexxitthhyymmia/margin-notes): a Chrome extension that sends notes to an agent. Its channel delivery is blocked here.
- [annotation-overlay-mcp](https://github.com/cc10143/annotation-overlay-mcp): another extension plus MCP server for annotations, worth reading before building.
- [Agentation](https://github.com/benjitaylor/agentation): the option this direction does not use.
