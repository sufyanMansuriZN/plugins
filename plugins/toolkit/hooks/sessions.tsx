import { read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { StartedSession } from '../types'
import { MODES, NAME_MAX, backgroundedId, planStart, startCommand } from './sessions-model'
import type { Caller } from './sessions-model'

export const START_TOOL = 'mcp__toolkit__start_session'

const STARTED = { plugin: 'toolkit', key: 'started' } as const

const START_DESCRIPTION = `Start a separate Claude Code session for a task while you stay with the user (when: see "Starting other sessions"). It runs as a background session (\`claude --bg\`) the user can open with \`claude attach <id>\`, talk to and stop, and that you reach with SendMessage by its name.
context: "fork" = this whole conversation + your \`prompt\`; "fresh" (default) = your \`prompt\` alone, so it holds everything a reader who has not seen this conversation needs.
Folder: \`use_worktree\` true = its own git worktree, which Claude Code cuts from the remote default branch on branch \`worktree-<name>\` (the default for "fresh" when this session is in a worktree); false = shares this folder and can edit it. \`cwd\` = another folder, as it is.`

const START_SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: 'The brief: the task, the files or area, what done looks like. For "fresh", also the goal, decisions and constraints so far. Put file paths and code identifiers in backticks.' },
    name: { type: 'string', description: `Short handle ([a-z0-9-], ≤${NAME_MAX}), e.g. "cli-cleanup": its name in \`claude agents\` and for SendMessage. A suffix is added when a session started here has it.` },
    context: { type: 'string', enum: ['fresh', 'fork'], description: '"fresh" (default) or "fork". A fork works in this folder.' },
    use_worktree: { type: 'boolean', description: '"fresh" only. true = its own worktree; false = shares this folder.' },
    cwd: { type: 'string', description: 'Another folder on this computer the session works in, as it is: an absolute path.' },
    model: { type: 'string', description: 'Optional: a cheaper model for mechanical or read-only pieces (e.g. sonnet or haiku). Omit to inherit yours.' },
    permission_mode: { type: 'string', enum: MODES, description: "Only when the user asked for a mode. Omitted, it starts in the user's own default mode." },
  },
  required: ['prompt', 'name'],
}

async function git($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  const run = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 30_000 }).catch(() => null)
  return run?.exitCode === 0 ? run.stdout.trim() : null
}

// Who each queued prompt came from, by its text, until its turn starts. A background task this
// session started reports back for the turn that started it, so its turn keeps that turn's caller.
type From = 'user' | 'event' | 'same'
const queued = new Map<string, From>()
let isEventTurn = false

async function caller($: EngineInterface): Promise<Caller> {
  const cwd = await $.session.cwd()
  const [gitDir, commonDir] = await Promise.all([git($, cwd, ['rev-parse', '--absolute-git-dir']), git($, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])])
  return {
    cwd,
    isWorktree: gitDir !== null && commonDir !== null && gitDir !== commonDir,
    isEventTurn,
    names: ((await read($, STARTED)) ?? []).map(s => s.name),
  }
}

export const register: Register = on => {
  // Desktop starts its own sessions, and a -p run has no one to open one.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: 'start_session', description: START_DESCRIPTION, inputSchema: START_SCHEMA, isDeferred: false })
    return next(e)
  })

  // Where a prompt came from is known when it is queued; its turn starts later, by its text.
  on('prompt.submit', { origin: { kind: 'composer' } }, async ($, e, next) => {
    queued.set(e.text, 'user')
    return next(e)
  })
  on('prompt.submit', { origin: { kind: 'plugin' } }, async ($, e, next) => {
    queued.set(e.text, e.origin.kind === 'plugin' && e.origin.asUser === true ? 'user' : 'event')
    return next(e)
  })
  on('prompt.submit', { origin: { kind: 'task-notification' } }, async ($, e, next) => {
    queued.set(e.text, 'same')
    return next(e)
  })
  // A subagent's hand-back arrives as a peer message, from the agent's id; only this session's own agents report as a background task.
  on('prompt.submit', { origin: { kind: 'peer' } }, async ($, e, next) => {
    const from = /^<agent-message from="([^"]+)"/.exec(e.text)?.[1]
    const isOwnAgent = from !== undefined && (await $.agent.list().catch(() => [])).some(agent => agent.id === from && agent.parentId === undefined)
    queued.set(e.text, isOwnAgent ? 'same' : 'event')
    return next(e)
  })
  on('prompt.submit', { origin: { kind: /^(scheduled-trigger|peer-send-message|channel|projects-relay)$/ } }, async ($, e, next) => {
    queued.set(e.text, 'event')
    return next(e)
  })
  // A turn that another session's message or another automated event started starts no session, so sessions never wake each other into new ones.
  on('turn.start', { text: /[\s\S]*/ }, async ($, e, next) => {
    if (e.agentId === undefined) {
      const from = queued.get(e.text) ?? [...queued].find(([text]) => e.text.includes(text))?.[1]
      if (from !== 'same') isEventTurn = from === 'event'
      queued.clear()
    }
    return next(e)
  })

  on('tool.call', { tool: START_TOOL }, async ($, e) => {
    const brief = planStart(e, await caller($))
    if ('deny' in brief) return brief
    const stat = await $.fs.stat(brief.cwd, { resolve: true }).catch(() => undefined)
    if (stat?.kind !== 'dir') return { deny: `${brief.cwd} is not a folder on this computer.` }
    const cwd = stat.realPath ?? brief.cwd
    const run = await $.process.run(startCommand(brief, await $.session.id()), { cwd, timeoutMs: 90_000 }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
    const id = backgroundedId(run.stdout)
    if (run.exitCode !== 0 || id === null) return { deny: `The session did not start: ${(run.stderr || run.stdout).trim().slice(0, 500) || `exit code ${run.exitCode}`}` }
    const where = brief.isWorktree ? `worktree .claude/worktrees/${brief.name} on branch worktree-${brief.name}` : cwd
    await update($, STARTED, was => [...(was ?? []), { name: brief.name, id, where, callId: e.tool_use_id }])
    return {
      result: `Started session "${brief.name}" (id ${id}) in ${where}. The user can open it with \`claude attach ${id}\`. To hear when it ends its turn, with its final message, call SendMessage {"to": "${brief.name}", "notify_when_idle": true} now, with no message; pass notify_when_idle with each follow-up too. Never poll it.`,
    }
  })

  // The call's row names the session and copies the command that opens it.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: START_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored || e.props.isRunning) return next(e)
    const session = ((await read($, STARTED)) ?? []).find(s => s.callId === e.props.tool_use_id)
    if (!session) return next(e)
    return sessionRow($.ui.resolve(e), session, () => void $.ui.copy({ text: `claude attach ${session.id}`, surface: 'terminal' }))
  })

  // The row above says it all; an error keeps the engine's drawing, so its reason shows.
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: START_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

/** Drawn as the engine draws a tool row: a bullet, `New session` and the name, then the folder and the attach command under ⎿. */
function sessionRow({ Box, Button, Text }: Elements['terminal'], session: StartedSession, copy: () => void) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box width={2} minWidth={2}>
          <Text>●</Text>
        </Box>
        <Text>
          <Text weight="semibold">New session</Text> {session.name}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Box width={5} minWidth={5}>
          <Text dimColor>{'  ⎿  '}</Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" flexGrow={1}>
          <Text dimColor>{`${session.where}  ·  `}</Text>
          <Box key={`hover:attach:${session.id}`}>
            <Button key={`attach:${session.id}`} plain hover={{ underline: true }} label={`claude attach ${session.id}`} onPress={copy} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
