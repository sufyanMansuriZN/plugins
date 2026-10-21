## ADDED Requirements

### Requirement: One plugin for many tools
The marketplace SHALL ship a plugin named `toolkit` that expands Claude Code with tools. It SHALL load one hooks module, `hooks/register.tsx`. Each tool SHALL live in its own file under `hooks/` and export `register`. The root module SHALL hold one line per tool that calls that tool's `register` when its option allows it.

#### Scenario: Install
- **WHEN** a user runs `claude plugin install toolkit@plugins`
- **THEN** the mermaid preview and the cd tool are both active, with no option set

#### Scenario: Adding a tool
- **WHEN** a maintainer adds a tool
- **THEN** the change is one new file in `hooks/`, one line in `hooks/register.tsx` and one field in `userConfig`

### Requirement: Each tool can be turned off
The manifest's `userConfig` SHALL have one boolean field per tool, named by the tool's key, with a plain title and description and a default of `true`. A tool whose field is `false` SHALL register no hooks. The plugin's own hooks SHALL NOT add rows to `/config`.

#### Scenario: Default
- **WHEN** no option is stored for `toolkit`
- **THEN** every tool registers its hooks

#### Scenario: Mermaid off
- **WHEN** the `mermaid` option is `false`
- **THEN** session start writes no drawing settings, and a reply with a drawn mermaid block is left to the engine

#### Scenario: cd off
- **WHEN** the `cd` option is `false`
- **THEN** session start registers no `cd` tool

### Requirement: Tool state is named per tool
Every `$.state` key the plugin uses SHALL be under the `toolkit` plugin and SHALL start with its tool's key. The mermaid preview SHALL use `mermaidDir`, `mermaidDiagram` and `mermaidIsSource`.

#### Scenario: Mermaid state
- **WHEN** a session in Ghostty starts with the mermaid preview on
- **THEN** the cache folder is stored at `{ plugin: 'toolkit', key: 'mermaidDir' }`

### Requirement: Mermaid preview
The `mermaid` tool SHALL keep the behaviour of the `mermaid-preview` plugin 0.1.0. In Ghostty or kitty, and not through tmux, it SHALL draw each closed mermaid block of a reply as a picture with mermaid-cli 12.0.0 through `npx`, with a button that shows its source. Elsewhere it SHALL leave replies to the engine.

#### Scenario: A drawn diagram
- **WHEN** a reply holds a mermaid block that is already drawn, in Ghostty
- **THEN** the block is shown as a picture inside the engine's reply frame

#### Scenario: Through tmux
- **WHEN** the session runs in Ghostty through tmux
- **THEN** every reply is left to the engine

### Requirement: cd tool
The `cd` tool SHALL register a model tool named `cd`, called as `mcp__toolkit__cd`, that takes a `path` and an optional `task`. A path that is not a directory SHALL be denied. For a directory, the call SHALL answer at once, then run `/cd <realPath>` from a timer and submit a prompt that names the new directory and the task.

#### Scenario: Not a directory
- **WHEN** the model calls `mcp__toolkit__cd` with a path that leads to a file or nowhere
- **THEN** the call is denied with a reason that names the path, and no command runs

#### Scenario: A directory
- **WHEN** the model calls `mcp__toolkit__cd` with path `../app`, which resolves to `/w/app`, and task `Run the tests`
- **THEN** `/cd /w/app` runs, and then the prompt `The session now runs in /w/app. Run the tests` is submitted

#### Scenario: No task
- **WHEN** the model calls `mcp__toolkit__cd` with a directory and no task
- **THEN** the submitted prompt ends with `Continue the task you were on.`
