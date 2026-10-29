import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

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
    { items: PLAN.map(step => ({ ...step, status: 'in_progress' })) },
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

async function abovePrompt($: Engine, isWorking = false): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text.trim()).filter(words => words !== '')
  await ui.unmount()
  return texts
}

test('once Claude stops with steps open, the list stays above the prompt until the next turn', async ($, on) => {
  engine(on)
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN }))
  expect(await abovePrompt($)).toEqual(['◼', 'Read the parser', '◻', 'Fix blank lines', '◻', 'Run the tests', 'engine: AbovePrompt'])
  await $.turn.start({ text: '', turnId: 't2' })
  expect(await abovePrompt($, true)).toEqual(['engine: AbovePrompt'])
})

test('a list the last turn left alone stays under the spinner only, not above the prompt', async ($, on) => {
  let prompts = 1
  engine(on, () => prompts)
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN }))
  prompts = 2
  await turn($, 't2', async () => expect(await spinner($)).toContain('Read the parser'))
  expect(await abovePrompt($)).toEqual(['engine: AbovePrompt'])
  await turn($, 't3', () => $.tool.call({ tool: TOOL, advance: true }))
  expect(await abovePrompt($)).toContain('Fix blank lines')
})

test('a finished list is not drawn above the prompt', async ($, on) => {
  engine(on)
  await turn($, 't1', () => $.tool.call({ tool: TOOL, items: PLAN.map(step => ({ ...step, status: 'completed' })) }))
  expect(await abovePrompt($)).toEqual(['engine: AbovePrompt'])
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
