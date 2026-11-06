import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionMessage } from 'claude-code'

const TOOL = 'mcp__toolkit__update_plan'
const PLAN = [
  { content: 'Read the parser', status: 'in_progress' },
  { content: 'Fix blank lines', status: 'pending' },
  { content: 'Run the tests', status: 'pending' },
]

// Beneath the plugin: the engine's own rows and spinner, the session's tools, and turns.
function engine(on: On, prompts = () => 1): string[] {
  const registered: string[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine: ${e.component}`}</Text>
  })
  on('tool.register', (_$, e) => {
    registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: 'answer' in e ? e.answer : '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('session.turns', () => ({ value: prompts() }))
  return registered
}

// The spinner's lines and links, top to bottom, without the ⎿ mark; `press` clicks a link first.
async function spinner($: Engine, press?: string): Promise<string[]> {
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'Spinner', props: { word: 'Baking', message: null, suffix: '…', mode: 'tool-use' } })
  if (press) await ui.press({ key: press })
  const texts = (await ui.findAll({})).filter(found => found.type === 'Text' || found.type === 'Button')
  await ui.unmount()
  return texts.map(found => found.text.trim()).filter(words => words !== '' && words !== '⎿')
}

const typed = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
const turn = async ($: Engine, turnId: string, work: () => Promise<unknown>) => {
  await $.turn.start({ text: '', turnId })
  await work()
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId })
}

test('the tool is offered only in an interactive terminal session', async ($, on) => {
  const registered = engine(on)
  mock.env(on, {})
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: false })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(registered.filter(name => name === 'update_plan')).toEqual(['update_plan'])
})

test('a plan shows under the engine spinner, as Claude Code draws its own task list', async ($, on) => {
  engine(on)
  expect(await spinner($)).toEqual(['engine: Spinner'])
  const call = await $.tool.call({ tool: TOOL, items: PLAN })
  expect(call.result).toBe('Plan updated: 0 of 3 done. Now on step 1: Read the parser.')
  expect(await spinner($)).toEqual(['engine: Spinner', '◼', 'Read the parser', '◻', 'Fix blank lines', '◻', 'Run the tests'])
})

test('advance finishes the step in progress and starts the next one', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, items: PLAN })
  await $.tool.call({ tool: TOOL, advance: true })
  expect(await spinner($)).toEqual(['engine: Spinner', '✔', 'Read the parser', '◼', 'Fix blank lines', '◻', 'Run the tests'])
  await $.tool.call({ tool: TOOL, advance: true })
  const last = await $.tool.call({ tool: TOOL, advance: true })
  expect(last.result).toBe('Plan updated: 3 of 3 done. All steps are done.')
})

test('steps run in parallel: several in progress, start takes a list, advance finishes them all', async ($, on) => {
  engine(on)
  const parallel = await $.tool.call({ tool: TOOL, items: PLAN.map((step, index) => ({ ...step, status: index < 2 ? 'in_progress' : 'pending' })) })
  expect(parallel.result).toBe('Plan updated: 0 of 3 done. Now on steps 1: Read the parser; 2: Fix blank lines.')
  const one = await $.tool.call({ tool: TOOL, done: [1] })
  expect(one.result).toBe('Plan updated: 1 of 3 done. Now on step 2: Fix blank lines.')
  await $.tool.call({ tool: TOOL, items: PLAN })
  const started = await $.tool.call({ tool: TOOL, done: [1], start: [2, 3] })
  expect(started.result).toBe('Plan updated: 1 of 3 done. Now on steps 2: Fix blank lines; 3: Run the tests.')
  expect(await spinner($)).toEqual(['engine: Spinner', '✔', 'Read the parser', '◼', 'Fix blank lines', '◼', 'Run the tests'])
  const last = await $.tool.call({ tool: TOOL, advance: true })
  expect(last.result).toBe('Plan updated: 3 of 3 done. All steps are done.')
})

test('done and start move steps out of order', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, items: PLAN })
  const call = await $.tool.call({ tool: TOOL, done: [1], start: 3 })
  expect(call.result).toBe('Plan updated: 1 of 3 done. Now on step 3: Run the tests.')
  const back = await $.tool.call({ tool: TOOL, start: 2 })
  expect(back.result).toBe('Plan updated: 1 of 3 done. Now on step 2: Fix blank lines.')
  expect(await spinner($)).toEqual(['engine: Spinner', '✔', 'Read the parser', '◼', 'Fix blank lines', '◻', 'Run the tests'])
})

test('bad calls are denied with a reason Claude can act on, and the plan stays', async ($, on) => {
  engine(on)
  expect((await $.tool.call({ tool: TOOL, advance: true })).deny).toContain('no plan yet')
  await $.tool.call({ tool: TOOL, items: PLAN })
  const bad = [
    {},
    { items: [] },
    { items: [{ content: ' ', status: 'pending' }] },
    { items: [{ content: 'A', status: 'doing' }] },
    { start: [2, 4] },
    { items: Array.from({ length: 13 }, (_, i) => ({ content: `Step ${i}`, status: 'pending' })) },
    { done: [4] },
    { start: 0 },
  ]
  for (const input of bad) {
    const call = await $.tool.call({ tool: TOOL, ...input })
    expect(typeof call.deny).toBe('string')
  }
  expect((await spinner($))[2]).toBe('Read the parser')
})

test('a side question typed while Claude is idle keeps the list, and advance goes on from it', async ($, on) => {
  engine(on)
  await typed($, 'fix it')
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN }))
  await typed($, 'why that parser?')
  expect(await spinner($)).toContain('Read the parser')
  let call: Awaited<ReturnType<typeof $.tool.call>> | undefined
  await turn($, 't2', async () => (call = await $.tool.call({ tool: TOOL, advance: true })))
  expect(call?.result).toBe('Plan updated: 1 of 3 done. Now on step 2: Fix blank lines.')
})

test('a new whole list replaces the old one', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, items: PLAN })
  await typed($, 'something else')
  await $.tool.call({ tool: TOOL, items: [{ content: 'Look at the logs', status: 'in_progress' }] })
  expect(await spinner($)).toEqual(['engine: Spinner', '◼', 'Look at the logs'])
})

test('a message typed mid-turn and a turn a background task wakes keep the list', async ($, on) => {
  engine(on)
  await $.turn.start({ text: '', turnId: 't1' })
  await $.tool.call({ tool: TOOL, items: PLAN })
  await typed($, 'also check the docs')
  expect(await spinner($)).toContain('Read the parser')
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  await $.prompt.submit({ text: 'task done', wait: false, origin: { kind: 'task-notification' } })
  await turn($, 't2', () => $.tool.call({ tool: TOOL, advance: true }))
  expect(await spinner($)).toContain('Fix blank lines')
})

// The band above the prompt, with the main conversation's transcript in view unless `view` names an agent.
async function abovePrompt($: Engine, view: { agentId?: string } = {}): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view },
  })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text.trim()).filter(words => words !== '')
  await ui.unmount()
  return texts
}

// The session's transcript as the toolkit reads its end: one reply row per uuid, written during the turn.
function withReplies(on: On, ...uuids: string[]) {
  const rows = uuids.map(uuid => JSON.stringify({ type: 'assistant', uuid, timestamp: new Date(Date.now() + 60_000).toISOString(), message: { content: [{ type: 'text', text: `Reply ${uuid}.` }] } }))
  mock.env(on, { HOME: '/home/me' })
  on('session.id', () => ({ value: 'session-uuid' }))
  on('process.run', (_$, e) => {
    const stdout = e.argv[0] === 'find' ? '/home/me/.claude/projects/-w/session-uuid.jsonl\n' : e.argv[0] === 'tail' ? rows.join('\n') : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.log', () => ({ value: undefined }))
}

// The reply block `uuid` and what the toolkit draws under it.
async function reply($: Engine, uuid: string): Promise<string[]> {
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'AssistantMessage', requestId: uuid, props: { text: `Reply ${uuid}.`, isFirstOfReply: true } })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text.trim()).filter(words => words !== '')
  await ui.unmount()
  return texts
}

const settle = async () => {
  for (let i = 0; i < 300; i++) await Promise.resolve()
}

test('once Claude stops with steps open, the list shows under the turn\'s last reply, not above the prompt, until the next turn starts', async ($, on) => {
  engine(on)
  withReplies(on, 'r1', 'r2')
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN }))
  await settle()
  expect(await reply($, 'r2')).toEqual(['engine: AssistantMessage', '◼', 'Read the parser', '◻', 'Fix blank lines', '◻', 'Run the tests'])
  expect(await reply($, 'r1')).toEqual(['engine: AssistantMessage'])
  expect(await abovePrompt($)).toEqual(['engine: AbovePrompt'])
  await $.turn.start({ text: '', turnId: 't2' })
  expect(await reply($, 'r2')).toEqual(['engine: AssistantMessage'])
  expect(await spinner($)).toContain('Read the parser')
})

test('a list the last turn left alone stays under the spinner only, not under the reply', async ($, on) => {
  let prompts = 1
  engine(on, () => prompts)
  withReplies(on, 'r1')
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN }))
  await settle()
  prompts = 2
  await turn($, 't2', async () => expect(await spinner($)).toContain('Read the parser'))
  await settle()
  expect(await reply($, 'r1')).toEqual(['engine: AssistantMessage'])
  await turn($, 't3', () => $.tool.call({ tool: TOOL, advance: true }))
  await settle()
  expect(await reply($, 'r1')).toContain('Fix blank lines')
})

test('a finished list is not drawn under the reply', async ($, on) => {
  engine(on)
  withReplies(on, 'r1')
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN.map(step => ({ ...step, status: 'completed' })) }))
  await settle()
  expect(await reply($, 'r1')).toEqual(['engine: AssistantMessage'])
})

test("with a subagent's transcript in view, the spinner shows no list", async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, items: PLAN })
  await abovePrompt($, { agentId: 'a1' })
  expect(await spinner($)).toEqual(['engine: Spinner'])
  await abovePrompt($)
  expect(await spinner($)).toContain('Read the parser')
})

test('a list goes away under the spinner the moment every step is done', async ($, on) => {
  engine(on)
  await turn($, 't1', async () => {
    await $.tool.call({ tool: TOOL, items: PLAN })
    await $.tool.call({ tool: TOOL, done: [1, 2] })
    expect(await spinner($)).toContain('Read the parser')
    const last = await $.tool.call({ tool: TOOL, done: [3] })
    expect(last.result).toBe('Plan updated: 3 of 3 done. All steps are done.')
    expect(await spinner($)).toEqual(['engine: Spinner'])
  })
})

test('an unfinished list survives the next turn start', async ($, on) => {
  engine(on)
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN }))
  await $.turn.start({ text: '', turnId: 't2' })
  expect(await spinner($)).toContain('Read the parser')
})

test('a rewind past the prompt the list was made under takes the list away', async ($, on) => {
  let prompts = 2
  engine(on, () => prompts)
  await $.tool.call({ tool: TOOL, items: PLAN })
  expect(await spinner($)).toContain('Read the parser')
  prompts = 1
  expect(await spinner($)).toEqual(['engine: Spinner'])
})

// A session started on a transcript that holds these messages, as `claude --continue` starts one.
function resume($: Engine, on: On, messages: SessionMessage[]) {
  on('session.start', () => ({ cwd: '/w' }))
  on('session.messages', () => ({ value: messages }))
  return $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
}

const call = (id: string, input: Record<string, unknown>, isError?: true) => ({ tool_use_id: id, tool: TOOL, input, text: 'ok', ...(isError ? { isError } : {}) })

test('a resumed session picks its list up from the calls, under the last reply and for advance', async ($, on) => {
  // The new process counts its own turns, whatever the transcript holds.
  engine(on, () => 0)
  withReplies(on, 'r9')
  await resume($, on, [
    { role: 'user', text: 'Fix the parser', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [call('p1', { items: PLAN })] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'p1', text: 'ok', result: 'ok', isError: false }] },
    { role: 'assistant', text: '', toolUses: [call('p2', { advance: true }), call('p3', { start: 9 }, true)] },
  ])
  await settle()
  expect(await reply($, 'r9')).toEqual(['engine: AssistantMessage', '✔', 'Read the parser', '◼', 'Fix blank lines', '◻', 'Run the tests'])
  const next = await $.tool.call({ tool: TOOL, advance: true })
  expect(next.result).toBe('Plan updated: 2 of 3 done. Now on step 3: Run the tests.')
})

test('a resumed session whose last turn left the list alone keeps it for advance, under the spinner only', async ($, on) => {
  engine(on, () => 0)
  withReplies(on, 'r9')
  await resume($, on, [
    { role: 'user', text: 'Fix the parser', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [call('p1', { items: PLAN })] },
    { role: 'user', text: 'What does blank mean here?', toolUses: [] },
    { role: 'assistant', text: 'An empty line.', toolUses: [] },
  ])
  await settle()
  expect(await reply($, 'r9')).toEqual(['engine: AssistantMessage'])
  expect((await $.tool.call({ tool: TOOL, advance: true })).result).toBe('Plan updated: 1 of 3 done. Now on step 2: Fix blank lines.')
})

test('a resumed session whose list was finished starts with none', async ($, on) => {
  engine(on)
  mock.env(on, {})
  const done = PLAN.map(step => ({ ...step, status: 'completed' }))
  await resume($, on, [
    { role: 'user', text: 'Fix the parser', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [call('p1', { items: PLAN }), call('p2', { items: done })] },
  ])
  expect(await spinner($)).toEqual(['engine: Spinner'])
})

test("a subagent's call leaves the main conversation's list as it was", async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, items: PLAN })
  const sub = await $.tool.call({ tool: TOOL, agentId: 'a1', items: [{ content: 'Grep the repo', status: 'in_progress' }] })
  expect(sub.deny).toBeUndefined()
  expect(sub.result).toContain('main conversation')
  expect(await spinner($)).toEqual(['engine: Spinner', '◼', 'Read the parser', '◻', 'Fix blank lines', '◻', 'Run the tests'])
})

test('the call and result rows are hidden, except under ctrl+o', async ($, on) => {
  engine(on)
  const row = (component: 'ToolUse' | 'ToolResult', isExpanded: boolean) =>
    $.ui.mount({
      plugin: 'toolkit',
      surface: 'terminal',
      component,
      requestId: 'call-1',
      props: { tool_use_id: 'call-1', tool: TOOL, input: { advance: true }, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok', isExpanded },
    })
  for (const component of ['ToolUse', 'ToolResult'] as const) {
    const hidden = await row(component, false)
    expect(await hidden.findAll({ type: 'Text' })).toHaveLength(0)
    await hidden.unmount()
    const shown = await row(component, true)
    expect((await shown.find({ type: 'Text' }))?.text).toBe(`engine: ${component}`)
    await shown.unmount()
  }
})

const LONG = Array.from({ length: 9 }, (_, index) => ({ content: `Step ${index + 1}`, status: index < 7 ? 'completed' : index === 7 ? 'in_progress' : 'pending' }))

test('a long list shows five steps around the one in progress and counts the rest, as Claude Code cuts its own lists', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, items: LONG.map(step => ({ ...step, status: step.content === 'Step 2' ? 'in_progress' : 'pending' })) })
  expect((await spinner($)).filter(words => words.startsWith('Step') || words.startsWith('…'))).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', '… +4 more'])
  await $.tool.call({ tool: TOOL, items: LONG })
  expect((await spinner($)).filter(words => words.startsWith('Step') || words.startsWith('…'))).toEqual(['Step 5', 'Step 6', 'Step 7', 'Step 8', 'Step 9', '… +4 more'])
  expect((await spinner($, 'toggle')).filter(words => /^(Step|…|show)/.test(words))).toEqual([...LONG.map(step => step.content), 'show less'])
})
