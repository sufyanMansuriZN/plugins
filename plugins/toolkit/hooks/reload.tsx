import type { EngineInterface, Register } from 'claude-code'

const NAME = 'reload_plugins'
const TOOL = `mcp__toolkit__${NAME}`

const DESCRIPTION = `Reloads this Claude Code session's plugins, the same as the person typing /reload-plugins --force. It loads what a restart of Claude Code would load for plugins, and the conversation stays.

Use it right after a plugin change that has not taken effect: a plugin installed, enabled, disabled, updated or removed, or a plugin's skills, agents, commands, hooks or mods changed on disk. Use it instead of asking the person to restart Claude Code or to run /reload-plugins.

Some changes still need a real restart, such as a plugin's MCP servers. The reload's report says which ones; then tell the person to restart with \`claude --continue\`.

The reload runs after your turn ends, so end your turn right after the call with one line that says you are reloading. A new turn then starts with the reload's report and your \`task\` text.`

const PENDING = { plugin: 'toolkit', key: 'reloadPending' } as const

// The pending reload's task for the first caller; every later one gets none.
const claim = async ($: EngineInterface): Promise<string | undefined> => {
  const { value, version } = await $.state.get(PENDING)
  if (value === null || value === undefined) return undefined
  return (await $.state.set(PENDING, null, { ifVersion: version })).isSet ? value.task : undefined
}

const finish = async ($: EngineInterface, report: string) => {
  const task = await claim($)
  if (task !== undefined) await $.prompt.submit({ text: `${report} ${task}` })
}

export const register: Register = on => {
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({
      name: NAME,
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description:
              'What you will do after the reload, in one sentence. You get it back as the first message after it, so write it so you can continue from it alone.',
          },
        },
        required: ['task'],
      },
      isDeferred: false,
    })
    // A reload of toolkit itself cancels this module's timers and drops the `.then` below, so the
    // reloaded module finishes it, from a timer: the host refuses a submit from a hook the turn may wait on.
    if ((await $.state.get(PENDING)).value)
      $.clock.after(0, () => void finish($, 'Plugins reloaded, toolkit with them.').catch(() => {}))
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { task } = e as unknown as { task?: unknown }
    const plan = typeof task === 'string' && task !== '' ? task : 'Continue the task you were on.'
    await $.state.set(PENDING, { task: plan })
    // A command run straight from a tool hook is refused, so it waits for the timer.
    $.clock.after(0, () => {
      void $.command
        .run({ command: 'reload-plugins', args: '--force' })
        .then(({ text }) => finish($, `Plugins reloaded. The reload said: ${text.trim() || 'nothing'}.`))
        .catch(async err => {
          await claim($)
          $.ui.toast(`toolkit: the plugin reload failed: ${String(err)}`)
        })
    })
    return { result: 'The reload runs when your turn ends, so end your turn now.' }
  })

  // A one-line row in place of the call with its task. ctrl+o still shows the whole call.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: TOOL } }, ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const bullet = e.props.isRunning ? <Text dimColor>●</Text> : <Text color={e.props.isErrored ? 'error' : 'success'}>●</Text>
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box width={2} minWidth={2}>
          {bullet}
        </Box>
        <Text bold>Reload plugins</Text>
      </Box>
    )
  })

  // An error keeps the engine's drawing, so its reason shows.
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: TOOL } }, ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{'  ⎿  reloads when this turn ends'}</Text>
  })
}
