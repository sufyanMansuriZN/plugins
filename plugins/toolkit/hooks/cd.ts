import type { EngineInterface, Register } from 'claude-code'

const NAME = 'change_session_directory'

const DESCRIPTION = `Moves this Claude Code session to another directory, the same as the person typing /cd. After the move, the project root, CLAUDE.md files, project settings, permission rules, hooks, MCP servers and skills come from the new directory, and relative paths resolve from it.

Use it when the work belongs to another project or repository: the person asks you to work there, or you need that project's CLAUDE.md, settings or git root. Use it instead of asking the person to run /cd.

Do not use it to:
- run one command somewhere else: use Bash with an absolute path or \`cd <dir> && <command>\`
- read or edit a file somewhere else: use the file's absolute path
- work in a git worktree of this repository: use EnterWorktree

The move runs after your turn ends, so end your turn right after the call with one line that says where you are going. A new turn then starts in the new directory and gives you back your \`task\` text.`

const PENDING = { plugin: 'toolkit', key: 'cdPending' } as const

// The pending move's task, for the first caller that names its directory; every later one gets none.
const claim = async ($: EngineInterface, dir: string): Promise<string | undefined> => {
  const { value, version } = await $.state.get(PENDING)
  if (value?.dir !== dir) return undefined
  return (await $.state.set(PENDING, null, { ifVersion: version })).isSet ? value.task : undefined
}

const finish = async ($: EngineInterface, dir: string) => {
  const task = await claim($, dir)
  if (task !== undefined) await $.prompt.submit({ text: `The session now runs in ${dir}. ${task}` })
}

// The host refuses a submit from a hook the turn may wait on, so a hook finishes from a timer.
const finishLater = async ($: EngineInterface, dir: string) => {
  if ((await $.state.get(PENDING)).value?.dir !== dir) return
  $.clock.after(0, () => void finish($, dir).catch(err => $.ui.toast(`toolkit: could not continue after the move to ${dir}: ${String(err)}`)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: NAME,
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory to move to: absolute, or relative to the current directory. It must exist.',
          },
          task: {
            type: 'string',
            description:
              'What you will do after the move, in one sentence. You get it back as the first message in the new directory, so write it so you can continue from it alone.',
          },
        },
        required: ['path', 'task'],
      },
      isDeferred: false,
    })
    // A reload during the move cancels this module's timers, so the reloaded module finishes it.
    await finishLater($, e.cwd)
    return next(e)
  })

  on('tool.call', { tool: `mcp__toolkit__${NAME}` }, async ($, e) => {
    const { path, task } = e as unknown as { path?: unknown; task?: unknown }
    if (typeof path !== 'string' || path === '') return { deny: 'path must be a directory path.' }

    const target = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
    if (target?.kind !== 'dir' || target.realPath === undefined) return { deny: `${path} is not a directory.` }

    const dir = target.realPath
    const plan = typeof task === 'string' && task !== '' ? task : 'Continue the task you were on.'
    // The move can reload this module and drop the `.then` below, so the task waits in state, where
    // the directory change hook and a reloaded module's start find it too. The first one submits it.
    await $.state.set(PENDING, { dir, task: plan })
    // A command run straight from a tool hook is refused, so it waits for the timer.
    $.clock.after(0, () => {
      void $.command
        .run({ command: 'cd', args: dir })
        .then(() => finish($, dir))
        .catch(async err => {
          // So a later move to the same folder does not submit this task.
          await claim($, dir)
          $.ui.toast(`toolkit: the move to ${dir} failed: ${String(err)}`)
        })
    })
    return { result: `The move to ${dir} runs when your turn ends, so end your turn now.` }
  })

  on('classic.CwdChanged', async ($, e, next) => {
    await finishLater($, e.new_cwd)
    return next(e)
  })
}
