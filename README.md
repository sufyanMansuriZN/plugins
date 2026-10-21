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

- **session-bar** (3.1.0): Session bar above the prompt: git, model, context and usage windows, following the transcript in view. With a subagent's transcript open, it shows that subagent's type and model. Each usage window has a meter and says if you are ahead of, on or behind the pace that uses all of it by the reset. See [its README](plugins/session-bar/README.md)
- **plain-focus**: Always-on lean ADHD output rules plus ASD-STE100-style simple English (based on ayghri/i-have-adhd, MIT)
- **mermaid-preview**: Draws each mermaid block of a reply as a picture in the chat, in Ghostty or kitty. A button under each picture shows its source. Needs Node: mermaid-cli 12.0.0 runs through `npx` (the first run downloads it and Chromium). Not through tmux; elsewhere replies are left as they are
