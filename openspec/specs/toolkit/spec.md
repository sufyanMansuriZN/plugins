# toolkit Specification

## Purpose
`toolkit` is one plugin that holds the small tools that expand Claude Code, so a user installs them once: the mermaid preview, table copy and the change session directory tool. Every tool is always on. Disabling the plugin is the off switch.

## Requirements

### Requirement: One plugin for many tools
The marketplace SHALL ship a plugin named `toolkit` that expands Claude Code with tools. It SHALL load one hooks module, `hooks/register.tsx`. Each tool SHALL live in its own file under `hooks/` and export `register`. The root module SHALL hold one line per tool that calls that tool's `register`.

#### Scenario: Install
- **WHEN** a user runs `claude plugin install toolkit@plugins`
- **THEN** the mermaid preview, table copy and the change session directory tool are all active

#### Scenario: Adding a tool
- **WHEN** a maintainer adds a tool
- **THEN** the change is one new file in `hooks/` and one line in `hooks/register.tsx`

### Requirement: Every tool is always on
The manifest SHALL have no `userConfig`, and every tool SHALL always be on. The plugin's own hooks SHALL NOT add rows to `/config`.

#### Scenario: No option
- **WHEN** a session starts with `toolkit` enabled
- **THEN** every tool registers its hooks, and `/plugin` shows no option for `toolkit`

### Requirement: Tool state is named per tool
Every `$.state` key the plugin uses SHALL be under the `toolkit` plugin and SHALL start with its tool's key. The mermaid preview SHALL use `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`.

#### Scenario: Mermaid state
- **WHEN** a session in Ghostty starts with the mermaid preview on
- **THEN** the cache folder is stored at `{ plugin: 'toolkit', key: 'mermaidDir' }`

### Requirement: Mermaid preview
The mermaid preview's session start hook SHALL run only on the terminal surface. In Ghostty or kitty, and not through tmux, it SHALL draw each closed mermaid block of a reply as a picture with no browser, through node. A plain dim link under a picture SHALL show its source. Elsewhere it SHALL leave mermaid blocks as text.

#### Scenario: A drawn diagram
- **WHEN** a reply holds a mermaid block that is already drawn, in Ghostty
- **THEN** the block is shown as a picture inside the engine's reply frame

#### Scenario: Drawing a new diagram
- **WHEN** a reply holds a mermaid block that is not drawn yet
- **THEN** `beautiful-mermaid` 1.1.3 and `@resvg/resvg-js` 2.6.2 are installed with npm into the cache folder if missing, and the diagram is drawn as a light and a dark PNG with a transparent background, grey borders and `#D77757` arrowheads

#### Scenario: Theme
- **WHEN** Claude Code's `theme` setting starts with `light` or `dark`
- **THEN** the picture for that theme is shown
- **WHEN** the setting is `auto`
- **THEN** the OS preference decides (`gsettings` color-scheme on Linux, `AppleInterfaceStyle` on macOS), dark when it cannot be read, and a change is shown within 5 seconds

#### Scenario: A long diagram
- **WHEN** a diagram is taller than half the screen
- **THEN** it is shrunk to half the screen's height (at least 8 rows), a flowchart is shown the way (as written or turned) that draws larger, and below 60% of its natural size an `open full size` link opens it with `xdg-open` or `open`

#### Scenario: A type that is not drawn
- **WHEN** a mermaid block is a gantt, pie, mindmap, gitGraph or other type the renderer does not draw
- **THEN** it stays as source, drawn by the engine as any code block, and nothing runs

#### Scenario: Through tmux
- **WHEN** the session runs in Ghostty through tmux
- **THEN** a reply's mermaid blocks stay text

### Requirement: One hook draws a reply
The plugin SHALL draw a reply from one `ui.render` hook on `AssistantMessage`, on the terminal surface only and never for a summary. It SHALL split the reply into text, mermaid blocks and tables, a table inside a mermaid block not being a table. A reply with only text SHALL be left to the engine. Otherwise the blocks SHALL be drawn in order in the engine's reply frame, the bullet once.

#### Scenario: A table and a diagram
- **WHEN** a reply holds text, a table, more text and a mermaid block that is already drawn, in Ghostty
- **THEN** the table is shown with its copy buttons under it, the diagram is shown as a picture, and the bullet shows once

#### Scenario: No picture terminal
- **WHEN** a reply holds a table and a mermaid block, and the terminal draws no pictures
- **THEN** the mermaid block stays text and the table still has its copy buttons

#### Scenario: Desktop
- **WHEN** a reply with a table is drawn on the desktop surface
- **THEN** the reply is left to the engine

### Requirement: Table copy
Under each table of a reply, the plugin SHALL draw the row `copy as markdown  ·  copy table`, two dim buttons with no brackets that underline on hover. A toast SHALL confirm each copy with the table's row count, and SHALL name the table by number when the reply has more than one.

#### Scenario: Copy as markdown
- **WHEN** the person presses `copy as markdown` under a table of 2 rows
- **THEN** the table as written is copied and the toast says `Copied table as markdown (2 rows)`

#### Scenario: Copy table on X11
- **WHEN** the person presses `copy table`, and the X11 clipboard script exits 0
- **THEN** the clipboard holds the table as `text/html` and as tab-separated cells, and the toast says `Copied table (2 rows)`

#### Scenario: Copy table without X11
- **WHEN** the person presses `copy table`, and the script exits with another code or `python3` does not run
- **THEN** the tab-separated cells are copied, and the toast says `Copied table as tab-separated cells (a formatted copy needs an X11 desktop) (2 rows)`

#### Scenario: Two tables
- **WHEN** a reply holds two tables and the person presses `copy table` under the second
- **THEN** the toast says `Copied table 2 (2 rows)`

### Requirement: Change session directory tool
The `cd` tool SHALL register a model tool named `change_session_directory`, called as `mcp__toolkit__change_session_directory`. Its description SHALL say what the tool does, when to use it and when not to. Its input SHALL require `path` and `task`. A path that is not a directory SHALL be denied before anything is asked.

#### Scenario: Not a directory
- **WHEN** the model calls the tool with a path that leads to a file or nowhere
- **THEN** the call is denied with a reason that names the path, no dialog opens and no command runs

#### Scenario: Registered
- **WHEN** a session starts
- **THEN** the tool `change_session_directory` is registered with `path` and `task` required

### Requirement: Every move needs the person's approval
For a directory, the tool SHALL ask the person in a dialog `Move this session to <realPath>?` with `Claude's plan there: <task>`, and the options `Stay` then `Move`, `Stay` first. Only `Move` SHALL queue the move: `/cd <realPath>` from a timer, then a prompt that names the directory and the task. Every other outcome SHALL deny the call and run no command. No option, setting, permission rule or auto mode SHALL skip the dialog.

#### Scenario: Approve
- **WHEN** the model calls the tool with a link that resolves to `/w/app` and task `Run the tests.`, and the person chooses `Move`
- **THEN** the call answers at once, then `/cd /w/app` runs and the prompt `The session now runs in /w/app. Run the tests.` is submitted

#### Scenario: Stay
- **WHEN** the person chooses `Stay`
- **THEN** the call is denied with `The person chose to stay in the current directory.` and no command runs

#### Scenario: Other text
- **WHEN** the person types `not now` under Other
- **THEN** the call is denied with `The person did not approve the move and said: not now` and no command runs

#### Scenario: Dismissed
- **WHEN** the person closes the dialog
- **THEN** the call is denied with `The move needs the person's approval, and none was given.` and no command runs

#### Scenario: Headless
- **WHEN** the tool is called in a `claude -p` run, where no one can answer the dialog
- **THEN** the call is denied with `The move needs the person's approval, and none was given.` and no command runs
