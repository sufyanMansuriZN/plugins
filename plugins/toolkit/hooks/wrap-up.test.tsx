import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__toolkit__wrap_up'
const RECAP = 'The parser now keeps blank lines. Nothing is committed.'
const ASK = 'Commit it now?'

type Host = { registered: string[]; prompts: { text: string; asUser?: true }[]; notified: string[] }

// Beneath the plugin: the engine's own rows, the session's tools, prompts and notifications.
function engine(on: On): Host {
  const host: Host = { registered: [], prompts: [], notified: [] }
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine: ${e.component}`}</Text>
  })
  on('tool.register', (_$, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  on('prompt.submit', (_$, e) => {
    host.prompts.push({ text: e.text, ...(e.origin?.kind === 'plugin' && e.origin.asUser ? { asUser: true as const } : {}) })
    return { text: e.text }
  })
  on('ui.notify', (_$, e) => {
    host.notified.push(e.text)
    return { value: { isSent: true, channel: 'ghostty' } }
  })
  return host
}

function mountRow($: Engine, input: unknown, props: { tool?: string; isExpanded?: boolean } = {}) {
  return $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'call-1',
    props: { tool_use_id: 'call-1', tool: props.tool ?? TOOL, input, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok', ...(props.isExpanded ? { isExpanded: true } : {}) },
  })
}

// The words the row shows, top to bottom, without the row's bullet, ⎿ and · marks.
async function shown(ui: { findAll: Awaited<ReturnType<typeof mountRow>>["findAll"] }): Promise<string[]> {
  const all = await ui.findAll({})
  return all.flatMap(found => {
    if (found.type !== 'Text' && found.type !== 'Button') return []
    const words = found.text.trim()
    return ['', '●', '⎿', '·'].includes(words) ? [] : [`${found.type}: ${words}`]
  })
}

test('the tool is offered only in an interactive terminal session', async ($, on) => {
  const host = engine(on)
  mock.env(on, {})
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: false })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(host.registered.filter(name => name === 'wrap_up')).toEqual(['wrap_up'])
})

test('bad input is denied with a reason Claude can act on', async ($, on) => {
  engine(on)
  const bad = [
    {},
    { recap: '  ' },
    { recap: RECAP, ask: ASK },
    { recap: RECAP, ask: ASK, actions: [] },
    { recap: RECAP, ask: ASK, actions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { recap: RECAP, ask: ASK, actions: [{ label: 'A label that is far too long to be a button' }] },
    { recap: RECAP, ask: ASK, actions: [{ label: '/clear' }] },
    { recap: RECAP, ask: ASK, actions: [{ action: 'archive' }] },
  ]
  for (const input of bad) {
    const call = await $.tool.call({ tool: TOOL, ...input })
    expect(typeof call.deny).toBe('string')
  }
})

test('a long ask is drawn, not refused', async ($, on) => {
  engine(on)
  const ask = `${'Which reference ID should I load next '.repeat(4)}?`
  const call = await $.tool.call({ tool: TOOL, recap: RECAP, ask, actions: [{ label: 'Yes' }] })
  expect(call.deny).toBeUndefined()
  expect(call.result).toContain(ask)
})

test('a button with hidden text behind its label is refused', async ($, on) => {
  engine(on)
  const call = await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Yes', message: 'Yes, and push to main too.' }] })
  expect(call.deny).toContain('sends only the label')
})

test('a call with nothing pending is accepted and asks for the full answer', async ($, on) => {
  const host = engine(on)
  const call = await $.tool.call({ tool: TOOL, recap: RECAP, blocked: true })
  expect(call.deny).toBeUndefined()
  expect(call.result).toContain('nothing is shown')
  expect(call.result).toContain('write your full answer')
  expect(host.notified).toEqual([])
})

test('the result names the question and asks for the full answer after the call, never a period', async ($, on) => {
  engine(on)
  const asked = await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Commit' }] })
  expect(asked.result).toContain(`"${ASK}"`)
  expect(asked.result).toContain('write your full answer')
  expect(asked.result).not.toContain('period')
})

const REPLY = 'The parser keeps blank lines now.'
const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()
const line = (value: object) => JSON.stringify(value)
// The turn's rows as the transcript holds them: the call, then the reply Claude writes after it.
const transcript = (calls: { id: string; input: object }[]) =>
  [
    line({ type: 'user', uuid: 'u1', timestamp: at(0), message: { content: 'Fix the parser.' } }),
    ...calls.map((call, i) => line({ type: 'assistant', uuid: `c${i}`, timestamp: at(1 + i), message: { content: [{ type: 'tool_use', id: call.id, name: TOOL, input: call.input }] } })),
    line({ type: 'assistant', uuid: 'a1', timestamp: at(5), message: { content: [{ type: 'text', text: REPLY }] } }),
  ].join('\n')

// This session's transcript, read with `tail`.
function withTranscript(on: On, jsonl: string) {
  mock.env(on, { HOME: '/home/me' })
  on('session.cwd', () => ({ value: '/w' }))
  on('session.id', () => ({ value: 'session-uuid' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: jsonl, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: 'answer' in e ? e.answer : '' }))
}

const endTurn = async ($: Engine, reason: 'answer' | 'error' = 'answer') => {
  await $.turn.complete({ reason, answer: REPLY, durationMs: 60_000, isAborted: false, turnId: 't1' })
  for (let i = 0; i < 300; i++) await Promise.resolve()
}

const mountReply = ($: Engine, requestId: string) =>
  $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'AssistantMessage', requestId, props: { text: REPLY, isFirstOfReply: true } })

// The words a mount shows, then it goes, so the same row can be mounted again.
async function once(mounting: ReturnType<typeof mountRow>): Promise<string[]> {
  const ui = await mounting
  const words = await shown(ui)
  await ui.unmount()
  return words
}

test('when the turn ends the box moves under the last reply text, at the end of the transcript, and stays there', async ($, on) => {
  engine(on)
  const input = { recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }] }
  withTranscript(on, transcript([{ id: 'call-1', input }]))
  await $.turn.start({ text: 'Fix the parser.', turnId: 't1' })
  await $.tool.call({ tool: TOOL, tool_use_id: 'call-1', ...input })
  const box = ['Text: Next step', `Text: ${RECAP}`, `Text: ${ASK}`, 'Button: Yes']
  // While the turn runs, nothing shows yet.
  expect(await once(mountRow($, input))).toEqual([])
  await endTurn($)
  expect(await once(mountRow($, input))).toEqual([])
  expect(await once(mountReply($, 'a1'))).toEqual(['Text: engine: AssistantMessage', ...box])
  expect(await once(mountReply($, 'c0'))).toEqual(['Text: engine: AssistantMessage'])
  // A typed prompt or a background turn leaves it under that reply.
  await $.prompt.submit({ text: 'Do something else', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'Do something else', turnId: 't2' })
  expect(await once(mountReply($, 'a1'))).toEqual(['Text: engine: AssistantMessage', ...box])
})

test('a turn that ends in an error keeps the box on its call row', async ($, on) => {
  engine(on)
  const input = { recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }] }
  withTranscript(on, transcript([{ id: 'call-1', input }]))
  await $.turn.start({ text: 'Fix the parser.', turnId: 't1' })
  await $.tool.call({ tool: TOOL, tool_use_id: 'call-1', ...input })
  await endTurn($, 'error')
  expect(await once(mountRow($, input))).toEqual(['Text: Next step', `Text: ${RECAP}`, `Text: ${ASK}`, 'Button: Yes'])
  expect(await once(mountReply($, 'a1'))).toEqual(['Text: engine: AssistantMessage'])
})

test('a second call replaces the first, so only one box shows', async ($, on) => {
  engine(on)
  const first = { recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }] }
  const second = { recap: 'Committed.', ask: 'Push it?', actions: [{ label: 'Push' }] }
  withTranscript(on, transcript([{ id: 'call-1', input: first }, { id: 'call-2', input: second }]))
  await $.turn.start({ text: 'Fix the parser.', turnId: 't1' })
  await $.tool.call({ tool: TOOL, tool_use_id: 'call-1', ...first })
  await $.tool.call({ tool: TOOL, tool_use_id: 'call-2', ...second })
  await endTurn($)
  expect(await once(mountRow($, first))).toEqual([])
  expect(await once(mountReply($, 'a1'))).toEqual(['Text: engine: AssistantMessage', 'Text: Next step', 'Text: Committed.', 'Text: Push it?', 'Button: Push'])
})

test('a question from a later turn leaves the earlier one on its call row, still open', async ($, on) => {
  engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  const first = { recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }] }
  await $.turn.start({ text: 'Fix the parser.', turnId: 't1' })
  await $.tool.call({ tool: TOOL, tool_use_id: 'call-1', ...first })
  await $.turn.start({ text: 'task done', turnId: 't2' })
  await $.tool.call({ tool: TOOL, tool_use_id: 'call-2', recap: 'The task ended.', ask: 'Look at it?', actions: [{ label: 'Look' }] })
  const row = await mountRow($, first)
  expect(await shown(row)).toEqual(['Text: Next step', `Text: ${RECAP}`, `Text: ${ASK}`, 'Button: Yes'])
  await row.unmount()
})

test('a blocked call notifies the user with its question', async ($, on) => {
  const host = engine(on)
  await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }], blocked: true })
  await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }] })
  expect(host.notified).toEqual([ASK])
})

test('a row whose input has no question draws nothing', async ($, on) => {
  engine(on)
  const ui = await mountRow($, { recap: RECAP })
  expect(await shown(ui)).toEqual([])
  await ui.unmount()
})

test('a call with a question and two answers draws both buttons under it', async ($, on) => {
  engine(on)
  const ui = await mountRow($, { recap: RECAP, ask: ASK, actions: [{ label: 'Yes, commit' }, { label: 'Leave uncommitted' }] })
  expect(await shown(ui)).toEqual(['Text: Next step', `Text: ${RECAP}`, `Text: ${ASK}`, 'Button: Yes, commit', 'Button: Leave uncommitted'])
  await ui.unmount()
})

test('a press sends exactly its label as the user and leaves only the choice', async ($, on) => {
  const host = engine(on)
  const ui = await mountRow($, { recap: RECAP, ask: ASK, actions: [{ label: 'Yes, commit' }, { label: 'Leave uncommitted' }] })
  await ui.press({ key: 'answer:1' })
  expect(host.prompts).toEqual([{ text: 'Leave uncommitted', asUser: true }])
  expect(await shown(ui)).toEqual(['Text: Next step', `Text: ${RECAP}`, 'Text: You chose: Leave uncommitted'])
  await ui.unmount()

  const again = await mountRow($, { recap: RECAP, ask: ASK, actions: [{ label: 'Yes, commit' }] })
  expect(await again.findAll({ type: 'Button' })).toHaveLength(0)
  await again.unmount()
})

test('an app action draws its own label and sends that label', async ($, on) => {
  const host = engine(on)
  const ui = await mountRow($, { recap: RECAP, ask: ASK, actions: [{ action: 'create_pr', label: 'ignored' }] })
  expect((await ui.findAll({ type: 'Button' })).map(button => button.text)).toEqual(['Create PR'])
  await ui.press({ key: 'answer:0' })
  expect(host.prompts).toEqual([{ text: 'Create PR', asUser: true }])
  await ui.unmount()
})

test('ctrl+o and other tools rows are left to the engine', async ($, on) => {
  engine(on)
  for (const mounted of [() => mountRow($, { recap: RECAP }, { isExpanded: true }), () => mountRow($, { command: 'ls' }, { tool: 'Bash' })]) {
    const ui = await mounted()
    expect(await shown(ui)).toEqual(['Text: engine: ToolUse'])
    await ui.unmount()
  }
})

test('the result row is hidden, except under ctrl+o', async ($, on) => {
  engine(on)
  const result = (isExpanded: boolean, tool = TOOL) =>
    $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'ToolResult', requestId: 'call-1', props: { tool_use_id: 'call-1', tool, output: 'ok', isErrored: false, isExpanded } })
  const hidden = await result(false)
  expect(await hidden.findAll({ type: 'Text' })).toHaveLength(0)
  await hidden.unmount()
  for (const mounted of [() => result(true), () => result(false, 'Bash')]) {
    const ui = await mounted()
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine: ToolResult')
    await ui.unmount()
  }
})
