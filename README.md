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

- **session-bar**: Session dir, model, ctx and paced usage pills above the prompt
- **prompt-polish**: Polishes the draft in the prompt box into clearer English on a chord (ctrl+↓), for review before you press Enter
