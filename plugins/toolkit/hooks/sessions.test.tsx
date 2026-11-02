import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// Beneath the plugin: a session in /w outside any git repository; `claude --bg` starts a session with id abcdef12.
function engine(on: On) {
  const host = { registered: [] as string[], runs: [] as { argv: string[]; cwd?: string }[], agents: [] as { id: string; description: string; type: string; status: 'completed' }[] }
  mock.env(on, { HOME: '/home/me' })
  on('agent.list', () => ({ value: host.agents }))
  on('session.cwd', () => ({ value: '/w' }))
  on('session.id', () => ({ value: 'parent-uuid' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', (_$, e) => {
    const done = (exitCode: number, stdout = '', stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    host.runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (e.argv[0] === 'claude') return done(0, 'backgrounded · abcdef12 · check-the-fix\n')
    if (e.argv[0] === 'uname') return done(0, 'Linux\n')
    return done(128, '', 'not a git repository')
  })
  on('fs.stat', (_$, e) => (e.path === '/nope' ? { deny: 'no such file' } : { value: { kind: 'dir' as const, realPath: e.path, size: 0, mtimeMs: 0, isLink: false } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: 'answer' in e ? e.answer : '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine: ${e.component}`}</Text>
  })
  on('tool.register', (_$, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  return host
}

const START = 'mcp__toolkit__start_session' as const
const CALL = 'toolu_0123abcd'
const ASKED = { name: 'check-the-fix', prompt: 'Run the saved event through the fix; done when each batch row is reported.' }

async function rowWords($: Engine, input: unknown, id = CALL): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool: START, input, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok' },
  })
  const all = await ui.findAll({})
  await ui.unmount()
  return all.flatMap(found => ((found.type === 'Text' || found.type === 'Button') && !['', '●', '⎿', '·'].includes(found.text.trim()) ? [found.text.trim()] : []))
}

test('only start_session is offered, in an interactive terminal session', async ($, on) => {
  const host = engine(on)
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(host.registered).toContain('start_session')
  for (const gone of ['dismiss_task', 'hand_off_to_session', 'list_sessions', 'stop_reports']) expect(host.registered).not.toContain(gone)
})

test('a start runs claude --bg in the folder, tells Claude to subscribe with SendMessage, and its row copies the attach command', async ($, on) => {
  const host = engine(on)
  const call = await $.tool.call({ tool: START, tool_use_id: CALL, ...ASKED })
  expect(call.result).toContain('Started session "check-the-fix" (id abcdef12)')
  expect(call.result).toContain('"notify_when_idle": true')
  expect(host.runs.at(-1)).toEqual({ argv: ['claude', '--bg', '-n', 'check-the-fix', '--settings', '{"worktree":{"bgIsolation":"none"}}', '--', ASKED.prompt], cwd: '/w' })
  const words = await rowWords($, ASKED)
  expect(words).toContain('New session')
  expect(words).toContain('claude attach abcdef12')
})

test('a folder that does not exist starts nothing', async ($, on) => {
  const host = engine(on)
  const call = await $.tool.call({ tool: START, tool_use_id: CALL, ...ASKED, cwd: '/nope' })
  expect(call.deny).toContain('/nope is not a folder')
  expect(host.runs.some(run => run.argv[0] === 'claude')).toBe(false)
})

test('a turn a background task wakes may start a session as the turn that started the task could', async ($, on) => {
  engine(on)
  const asked = { tool: START, tool_use_id: CALL, ...ASKED } as const
  const turn = async (text: string, origin: { kind: 'composer' | 'task-notification' | 'peer' }, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin } as Parameters<Engine['prompt']['submit']>[0])
    await $.turn.start({ text, turnId })
    await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId })
  }

  await turn('Run the smoke test, then start a reviewer.', { kind: 'composer' }, 't1')
  await $.prompt.submit({ text: 'smoke done', wait: false, origin: { kind: 'task-notification' } })
  await $.turn.start({ text: 'smoke done', turnId: 't2' })
  expect((await $.tool.call(asked)).result).toContain('abcdef12')
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't2' })

  await turn('Another Claude session sent a message: done', { kind: 'peer' }, 't3')
  await $.prompt.submit({ text: 'check done', wait: false, origin: { kind: 'task-notification' } })
  await $.turn.start({ text: 'check done', turnId: 't4' })
  expect((await $.tool.call({ ...asked, tool_use_id: 'toolu_second' })).deny).toContain('no session starts in it')
})

test('a hand-back from this session\'s own subagent may start a session, and a message naming another agent may not', async ($, on) => {
  const host = engine(on)
  host.agents.push({ id: 'a0ae4498', description: 'Opus review', type: 'general-purpose', status: 'completed' })
  const asked = { tool: START, tool_use_id: CALL, ...ASKED } as const
  const handBack = (from: string) => `<agent-message from="${from}">\n[Subagent hand-back] Verdict: approve\n</agent-message>`
  const turn = async (text: string, kind: 'composer' | 'peer', turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind } })
    await $.turn.start({ text, turnId })
  }

  await turn('Run round 2 when the reviews are back.', 'composer', 't1')
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  await turn(handBack('a0ae4498'), 'peer', 't2')
  expect((await $.tool.call(asked)).result).toContain('abcdef12')
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't2' })

  await turn(handBack('someone-else'), 'peer', 't3')
  expect((await $.tool.call({ ...asked, tool_use_id: 'toolu_second' })).deny).toContain('no session starts in it')
})
