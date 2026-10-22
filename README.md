# plugins

A personal [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin marketplace.

## Install

Add the marketplace once, then install a plugin by `<name>@plugins`.

From a shell:

```sh
claude plugin marketplace add sufyanMansuriZn/plugins
claude plugin install session-bar@plugins
```

From inside a Claude Code session:

```
/plugin marketplace add sufyanMansuriZn/plugins
/plugin install session-bar@plugins
```

## Plugins

- **session-bar** (3.1.0): Session bar above the prompt: git, model, context and usage windows, following the transcript in view. With a subagent's transcript open, it shows that subagent's type and model. Each usage window has a meter with a tick where an even pace stands. When you are ahead of or behind the pace that uses all of it by the reset, a word says so, on a background color that people with color blindness can tell apart. See [its README](plugins/session-bar/README.md)
- **plain-focus**: Always-on lean ADHD output rules plus ASD-STE100-style simple English (based on ayghri/i-have-adhd, MIT)
- **toolkit** (0.1.0): Expands Claude Code with tools. The mermaid preview draws each mermaid block of a reply as a picture, in Ghostty or kitty. Table copy puts buttons under each table in a reply, to copy it as markdown or as a table for Teams or a spreadsheet. The change session directory tool lets Claude move the session to another folder, as `/cd` does, after you approve each move. See [its README](plugins/toolkit/README.md)
