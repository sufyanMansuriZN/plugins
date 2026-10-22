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
async function shown(ui: Awaited<ReturnType<typeof mountRow>>): Promise<string[]> {
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

test('a button with hidden text behind its label is refused', async ($, on) => {
  engine(on)
  const call = await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Yes', message: 'Yes, and push to main too.' }] })
  expect(call.deny).toContain('sends only the label')
})

test('a call with nothing to decide is refused, so a turn never ends in a recap alone', async ($, on) => {
  engine(on)
  const call = await $.tool.call({ tool: TOOL, recap: RECAP })
  expect(call.deny).toContain('only when the user has a decision')
})

test('the result names the question and tells Claude not to repeat it', async ($, on) => {
  engine(on)
  const asked = await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Commit' }] })
  expect(asked.result).toContain(`"${ASK}"`)
  expect(asked.result).toContain('without repeating')
})

test('a blocked call notifies the user with its question', async ($, on) => {
  const host = engine(on)
  await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }], blocked: true })
  await $.tool.call({ tool: TOOL, recap: RECAP, ask: ASK, actions: [{ label: 'Yes' }] })
  expect(host.notified).toEqual([ASK])
})

test('a row whose input has no question is left to the engine', async ($, on) => {
  engine(on)
  const ui = await mountRow($, { recap: RECAP })
  expect(await shown(ui)).toEqual(['Text: engine: ToolUse'])
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
