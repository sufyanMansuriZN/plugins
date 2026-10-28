import type { EngineInterface, Register } from 'claude-code'

const NAME = 'restart_claude_code'
const TOOL = `mcp__toolkit__${NAME}`

const DESCRIPTION = `Exits Claude Code and starts it again in the same terminal, with this conversation resumed. A restart loads everything Claude Code reads only at startup: plugins and their MCP servers, settings, environment variables and a newly installed Claude Code version.

Use it when a change needs a restart to take effect, such as a plugin installed or updated, or when the person asks for a restart.

The restart ends everything this session runs. The call is refused while a subagent runs, but it cannot see background shells or monitors: stop the ones you started (TaskStop) before the call, or wait for them.

The restart runs after your turn ends, so end your turn right after the call with one line that says you are restarting. The resumed session has this whole conversation. Leave \`prompt\` out to resume idle, waiting for the person, or pass one to start the resumed session with it. The resumed session keeps the same model and the options it was started with that a restart keeps (--plugin-dir, --add-dir, --permission-mode, --settings, --mcp-config, --strict-mcp-config, --dangerously-skip-permissions).

It needs the toolkit's \`claude\` shell function. Without it, the call adds the function to ~/.bashrc, restarts nothing and says what the person must do once.`

const PENDING = { plugin: 'toolkit', key: 'restartPending' } as const

const BEGIN = '# >>> toolkit restart >>>'
const END = '# <<< toolkit restart <<<'

// Runs claude with a file to write the next run's arguments to; claude never gets the terminal back from a child it starts.
// A restart keeps only the options listed here: the others pick a session or carry a prompt, which the restart sets itself.
const FUNCTION = [
  BEGIN,
  'claude() {',
  '  local f="${XDG_RUNTIME_DIR:-/tmp}/claude-restart.$$" args=("$@") keep=() s',
  '  while (($#)); do',
  '    case $1 in',
  '      --plugin-dir|--permission-mode|--settings) keep+=("$1" "${2-}"); shift ;;',
  '      --add-dir|--mcp-config) keep+=("$1"); while [[ $# -gt 1 && $2 != -* ]]; do keep+=("$2"); shift; done ;;',
  '      --plugin-dir=*|--permission-mode=*|--settings=*|--add-dir=*|--mcp-config=*|--strict-mcp-config|--dangerously-skip-permissions) keep+=("$1") ;;',
  '    esac',
  '    (($#)) && shift',
  '  done',
  '  while :; do',
  '    rm -f "$f"',
  '    CLAUDE_RESTART_FILE="$f" command claude "${args[@]}"; s=$?',
  '    [ -s "$f" ] || return "$s"',
  '    mapfile -t args < "$f"',
  '    args=("${keep[@]}" "${args[@]}")',
  '  done',
  '}',
  END,
].join('\n')

/** The file the shell function reads the next run's arguments from, or why Claude Code cannot leave this terminal and come back. */
export async function relaunchFile($: EngineInterface): Promise<{ file: string } | { deny: string }> {
  const busy = (await $.agent.list()).filter(agent => ['pending', 'running', 'waiting'].includes(agent.status))
  if (busy.length > 0) {
    const names = busy.map(agent => agent.name ?? agent.description).join(', ')
    return { deny: `exiting would cut off ${busy.length === 1 ? 'a running agent' : `${busy.length} running agents`} (${names}). Wait for them to finish or stop them, then call again.` }
  }

  const rc = `${(await $.env.get('HOME')) ?? ''}/.bashrc`
  const text = (await $.fs.exists(rc)) ? await $.fs.read(rc) : ''
  const start = text.indexOf(BEGIN)
  const end = text.indexOf(END, start)
  // A block from an older toolkit is replaced, so a fix to the function reaches the next shell.
  const updated =
    start === -1 || end === -1
      ? `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}\n${FUNCTION}\n`
      : `${text.slice(0, start)}${FUNCTION}${text.slice(end + END.length)}`
  const isChanged = updated !== text
  if (isChanged) await $.fs.write(rc, updated)

  const file = await $.env.get('CLAUDE_RESTART_FILE')
  if (file) return { file }
  return {
    deny: `this Claude Code was not started through the toolkit's \`claude\` shell function, so nothing could run in this terminal after an exit. ${isChanged ? `The function is now in ${rc}. ` : `The function is in ${rc}, but this terminal has not loaded it. `}Tell the person to run \`source ~/.bashrc\` (or open a new terminal), exit Claude Code and start it again with \`claude --continue\`. From then on it works.`,
  }
}

/** Claude Code exits when this turn ends, and the shell function runs `claude <args>` in its place. */
export async function relaunch($: EngineInterface, file: string, args: string[]) {
  // One argument per line, read back with mapfile.
  await $.fs.write(file, args.join('\n'))
  await $.state.set(PENDING, file)
}

export const register: Register = on => {
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({
      name: NAME,
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Optional first prompt of the resumed session, sent as is. Omit it to resume without a prompt.',
          },
        },
      },
      isDeferred: false,
    })
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const ready = await relaunchFile($)
    if ('deny' in ready) return { deny: `Nothing was restarted: ${ready.deny}` }
    const { prompt } = e as unknown as { prompt?: unknown }
    const text = typeof prompt === 'string' ? prompt.replace(/\s+/g, ' ').trim() : ''
    await relaunch($, ready.file, ['--resume', await $.session.id(), '--model', await $.session.model(), ...(text ? [text] : [])])
    return { result: 'Claude Code exits when your turn ends and starts again with this conversation, so end your turn now.' }
  })

  // SIGTERM ends Claude Code as /exit does (transcript saved, terminal restored) but leaves no /exit row.
  on('turn.complete', { reason: /[\s\S]*/ }, async ($, e, next) => {
    const result = await next(e)
    const file = (await $.state.get(PENDING)).value
    if (file) {
      await $.state.set(PENDING, null)
      $.clock.after(0, () => {
        void $.process.run(['sh', '-c', 'kill -TERM "$PPID"']).catch(async err => {
          await $.fs.write(file, '')
          $.ui.toast(`toolkit: the restart failed: ${String(err)}`)
        })
      })
    }
    return result
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
        <Text bold>Restart Claude Code</Text>
      </Box>
    )
  })

  // An error keeps the engine's drawing, so its reason shows.
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: TOOL } }, ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{'  ⎿  restarts when this turn ends'}</Text>
  })
}
