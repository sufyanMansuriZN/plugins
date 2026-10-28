import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HAND_OFF = 'mcp__toolkit__hand_off_to_session'

// Beneath the plugin: the engine's rows, the tools registered, and a session outside any git repository
// whose transcript ends with `transcript`; `claude --bg` starts a session with id abcdef12.
// `claude agents --json` prints `agents`; files written land in `files`, and messages sent in `sent`.
function engine(on: On, transcript: string | (() => string) = '', agents = '[]') {
  const host = { registered: [] as string[], prompts: [] as string[], logs: [] as string[], files: new Map<string, string>(), sent: [] as string[] }
  on('session.send', (_$, e) => {
    host.sent.push(e.text)
    return { isDelivered: true }
  })
  on('ui.log', (_$, e) => {
    host.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    host.logs.push(e.text)
    return { value: undefined }
  })
  mock.env(on, { HOME: '/home/me' })
  on('session.cwd', () => ({ value: '/w' }))
  on('session.id', () => ({ value: 'parent-uuid' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', (_$, e) => {
    const done = (exitCode: number, stdout = '', stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'find') return done(0, `${e.argv[1]}/-w/${e.argv.at(-1)}\n`)
    if (e.argv[0] === 'tail') return done(0, typeof transcript === 'string' ? transcript : transcript())
    if (e.argv[0] === 'claude' && e.argv.includes('--bg')) return done(0, 'backgrounded · abcdef12 · check-the-fix\n')
    if (e.argv[0] === 'claude' && e.argv[1] === 'agents' && !e.argv.includes('--all')) return done(0, agents)
    if (e.argv[0] === 'claude') return done(0, '[]')
    return done(128, '', 'not a git repository')
  })
  on('fs.write', (_$, e) => {
    host.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: host.files.has(e.path) }))
  on('fs.read', (_$, e) => ({ value: host.files.get(e.path) ?? '' }))
  on('fs.stat', () => ({ value: { kind: 'dir', realPath: '/w', size: 0, mtimeMs: 0, isLink: false } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: 'answer' in e ? e.answer : '' }))
  on('prompt.submit', (_$, e) => {
    host.prompts.push(e.text)
    return { text: e.text }
  })
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

async function rowWords($: Engine, tool: string, input: unknown, id = tool): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok' },
  })
  const all = await ui.findAll({})
  await ui.unmount()
  return all.flatMap(found => ((found.type === 'Text' || found.type === 'Button') && !['', '●', '⎿', '·'].includes(found.text.trim()) ? [found.text.trim()] : []))
}

const START = 'mcp__toolkit__start_session'
const CALL = 'toolu_0123abcd'
const PROPOSE = {
  initiation: 'own_initiative',
  title: 'Check the fix',
  prompt: 'Run the saved event through the fix; done when each batch row is reported.',
  background: 'The user asked whether VES-6372 fixes blank Batch IDs; the tank records were checked here already.',
}
const REPLY = 'Yes for the Batch IDs.'
const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()
const row = (value: object) => JSON.stringify(value)
const TRANSCRIPT = [
  row({ type: 'user', uuid: 'u1', timestamp: at(0), message: { content: 'Check it yourself.' } }),
  row({ type: 'assistant', uuid: 'a1', timestamp: at(1), message: { content: [{ type: 'text', text: 'Checking the shape.' }] } }),
  row({ type: 'assistant', uuid: 'a2', timestamp: at(2), message: { content: [{ type: 'tool_use', id: CALL, name: START, input: PROPOSE }] } }),
  row({ type: 'assistant', uuid: 'a3', timestamp: at(3), message: { content: [{ type: 'text', text: REPLY }] } }),
].join('\n')

async function words(ui: { findAll: Awaited<ReturnType<Engine['ui']['mount']>>['findAll'] }): Promise<string[]> {
  const all = await ui.findAll({})
  return all.flatMap(found => (found.type === 'Text' || found.type === 'Button') && !['', '●', '⎿', '·'].includes(found.text.trim()) ? [found.text.trim()] : [])
}

const replyBlock = ($: Engine, requestId: string, text: string) =>
  $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true } })

// The turn proposes a session, ends, and its card is moved in the background.
async function proposeAndEnd($: Engine, reason: 'answer' | 'error') {
  await $.turn.start({ text: 'Check it yourself.', turnId: 't1' })
  const call = await $.tool.call({ tool: START, tool_use_id: CALL, ...PROPOSE })
  expect(call.result).toContain('do it here')
  await $.turn.complete({ reason, answer: REPLY, durationMs: 60_000, isAborted: false, turnId: 't1' })
  await settle()
}

// The move and a Start run in the background over several host calls: let them land.
async function settle() {
  for (let i = 0; i < 300; i++) await Promise.resolve()
}

test('a suggested session moves under the turn\'s last reply text when the turn ends, and stays there once started', async ($, on) => {
  const host = engine(on, TRANSCRIPT)
  await proposeAndEnd($, 'answer')
  expect(host.logs).toEqual([])
  expect(await rowWords($, START, PROPOSE, CALL)).toEqual([])
  const earlier = await replyBlock($, 'a1', 'Checking the shape.')
  expect(await words(earlier)).toEqual(['engine: AssistantMessage'])
  const last = await replyBlock($, 'a3', REPLY)
  const card = await words(last)
  expect(card[0]).toBe('engine: AssistantMessage')
  expect(card.some(w => w.startsWith('Suggested session') && w.includes('Check the fix'))).toBe(true)
  expect(card.slice(-2)).toEqual(['Start', 'Dismiss'])
  await last.press({ key: 'start:task_0123abcd' })
  await settle()
  expect(host.logs).toEqual([])
  expect(host.prompts).toEqual(['I started the suggested session "Check the fix" (task_0123abcd).'])
  await last.unmount()
  const started = await words(await replyBlock($, 'a3', REPLY))
  expect(started.some(w => w.startsWith('New session'))).toBe(true)
  expect(started).toContain('claude attach abcdef12')
  // The call that starts it by name keeps its own row.
  expect(await rowWords($, START, { proposal_id: 'task_0123abcd' })).toContain('New session')
})

test('a suggested session under a reply with a table still shows, as the table copy links do', async ($, on) => {
  const table = '| Tank | Batch |\n| --- | --- |\n| DOT P | 15jos9y |'
  engine(on, TRANSCRIPT.replace(REPLY, `${REPLY}\\n\\n${table.replaceAll('\n', '\\n')}`))
  await proposeAndEnd($, 'answer')
  const shown = await words(await replyBlock($, 'a3', `${REPLY}\n\n${table}`))
  expect(shown).toContain('copy table')
  expect(shown.slice(-2)).toEqual(['Start', 'Dismiss'])
})

test('a transcript that lags the end of the turn is read again until it holds the reply', async ($, on) => {
  let reads = 0
  const host = engine(on, () => (++reads === 1 ? TRANSCRIPT.split('\n').slice(0, 3).join('\n') : TRANSCRIPT))
  const clock = mock.clock(on)
  await proposeAndEnd($, 'answer')
  expect(await rowWords($, START, PROPOSE, CALL)).toEqual(expect.arrayContaining(['Start', 'Dismiss']))
  await clock.advance(300)
  await settle()
  expect(reads).toBe(2)
  expect(host.logs).toEqual([])
  expect(await rowWords($, START, PROPOSE, CALL)).toEqual([])
  expect((await words(await replyBlock($, 'a3', REPLY))).slice(-2)).toEqual(['Start', 'Dismiss'])
})

test('a suggested session dismissed in its own turn stays on its call\'s row', async ($, on) => {
  engine(on, TRANSCRIPT)
  await $.turn.start({ text: 'Check it yourself.', turnId: 't1' })
  await $.tool.call({ tool: START, tool_use_id: CALL, ...PROPOSE })
  await $.tool.call({ tool: 'mcp__toolkit__dismiss_task', task_id: 'task_0123abcd' })
  await $.turn.complete({ reason: 'answer', answer: REPLY, durationMs: 60_000, isAborted: false, turnId: 't1' })
  await settle()
  expect(await rowWords($, START, PROPOSE, CALL)).toContain('Dismissed')
  expect(await words(await replyBlock($, 'a3', REPLY))).toEqual(['engine: AssistantMessage'])
})

test('a turn that ends in an error keeps its suggested session on the call\'s row', async ($, on) => {
  engine(on, TRANSCRIPT)
  await proposeAndEnd($, 'error')
  expect(await rowWords($, START, PROPOSE, CALL)).toEqual(expect.arrayContaining(['Start', 'Dismiss']))
  expect(await words(await replyBlock($, 'a3', REPLY))).toEqual(['engine: AssistantMessage'])
})

test('hand_off_to_session is offered in an interactive terminal session', async ($, on) => {
  const host = engine(on)
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(host.registered).toContain('hand_off_to_session')
})

test('a hand-off without a plan is refused with the reason', async ($, on) => {
  engine(on)
  const call = await $.tool.call({ tool: HAND_OFF, title: 'Fix blank lines' })
  expect(call.deny).toContain('remaining_plan is required')
})

test('a hand-off call draws as a session row headed Handed off', async ($, on) => {
  engine(on)
  const words = await rowWords($, HAND_OFF, { title: 'Fix blank lines', remaining_plan: 'Run the tests.' })
  expect(words).toContain('Handed off')
  expect(words.some(w => w.includes('Fix blank lines'))).toBe(true)
  const start = await rowWords($, 'mcp__toolkit__start_session', { initiation: 'user_asked', title: 'Clean up' })
  expect(start).toContain('New session')
})

const LINK = '/home/me/.claude/toolkit/links/parent-u.json'

test('a started session reports to the session that started it only while that session is open', async ($, on) => {
  const open = engine(on, '', JSON.stringify([{ kind: 'interactive', sessionId: 'starter-uuid', status: 'idle' }]))
  open.files.set(LINK, JSON.stringify({ parent: 'starter-uuid', name: 'check-the-fix' }))
  await $.turn.complete({ reason: 'answer', answer: 'Fixed.', durationMs: 1000, isAborted: false, turnId: 't1' })
  await settle()
  expect(open.sent).toHaveLength(1)
  expect(open.sent[0]).toContain('Fixed.')
})

test('a started session sends nothing once the session that started it is closed', async ($, on) => {
  const closed = engine(on, '', '[]')
  closed.files.set(LINK, JSON.stringify({ parent: 'starter-uuid', name: 'check-the-fix' }))
  await $.turn.complete({ reason: 'answer', answer: 'Fixed.', durationMs: 1000, isAborted: false, turnId: 't1' })
  await settle()
  expect(closed.sent).toEqual([])
})

test('stop reports leaves the session working and cuts its link, from the row or by name', async ($, on) => {
  const host = engine(on)
  const input = { ...PROPOSE, initiation: 'user_asked', use_worktree: false }
  const started = await $.tool.call({ tool: START, tool_use_id: CALL, ...input })
  expect(started.result).toContain('abcdef12')
  const link = '/home/me/.claude/toolkit/links/abcdef12.json'
  expect(host.files.get(link)).toContain('parent-uuid')
  expect(await rowWords($, START, input, CALL)).toContain('stop reports')

  const ui = await $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: CALL,
    props: { tool_use_id: CALL, tool: START, input, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok' },
  })
  await ui.press({ key: 'mute' })
  await settle()
  await ui.unmount()
  expect(host.files.get(link)).toBe('')
  const after = await rowWords($, START, input, CALL)
  expect(after).not.toContain('stop reports')
  expect(after.some(w => w.includes('no reports'))).toBe(true)

  expect((await $.tool.call({ tool: 'mcp__toolkit__stop_reports', name: 'nope' })).deny).toContain('No session "nope"')
  const byName = await $.tool.call({ tool: 'mcp__toolkit__stop_reports', name: 'check-the-fix' })
  expect(byName.result).toContain('sends no more reports')
})
