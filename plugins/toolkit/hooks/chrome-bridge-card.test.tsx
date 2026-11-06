import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { commentPrompt } from './chrome-bridge-model'

const HOME = '/home/p'
const SESSION = 's-123'
const COMMENTS = `${HOME}/.claude/toolkit/chrome-bridge/comments/${SESSION}.jsonl`

const COMMENT = {
  id: 'c1', at: 'now', sessionId: SESSION, tabId: 4, url: 'https://developer.mozilla.org/x', title: 'scale CSS property - CSS | MDN',
  kind: 'element' as const, threadId: 'c1', body: 'Hi.', section: { text: 'Syntax' }, rect: { x: 1, y: 2, width: 3, height: 4 },
  viewport: { width: 1, height: 1, scrollY: 0, dpr: 1 },
}
const ROW = { text: commentPrompt(COMMENT, () => 'm1'), origin: { kind: 'plugin' as const, name: 'toolkit' }, isExpanded: false }
const OLD_ROW = {
  ...ROW,
  text: 'The person sent a new comment (thread c1) from a page in Chrome, tab 4. What they wrote:\n\nHi.\n\nCall read_tab with commentId "c1" to see the part of the page they marked and its screenshot.',
}

// Beneath the plugin: the comments file, the session, and the engine's own drawing.
function engine(on: On) {
  mock.env(on, { HOME })
  on('session.id', () => ({ value: SESSION }))
  on('fs.read', (_$, e) => {
    if (e.path !== COMMENTS) throw new Error(`ENOENT ${e.path}`)
    return { value: `${JSON.stringify(COMMENT)}\n` }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine drawing</Text>
  })
}

test('a comment prompt shows as the words and one line about the page, a prompt before 0.21.0 too', async ($, on) => {
  engine(on)
  for (const props of [ROW, OLD_ROW]) {
    const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'UserMessage', props })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
    expect(texts).toContain('❯ Hi.')
    expect(texts).toContain('  comment from Chrome, scale CSS property, near "Syntax"')
    expect(texts.join('\n')).not.toContain('read_tab')
    await ui.unmount()
  }
})

test('a toolkit prompt that is not a comment keeps the engine\'s drawing', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'UserMessage', props: { ...ROW, text: 'Something else' } })
  expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined()
  await ui.unmount()
})

test('a reply_comment call is one row with the page and the answer, and its result row is hidden', async ($, on) => {
  engine(on)
  const call = { tool_use_id: 't1', tool: 'mcp__toolkit__reply_comment', input: { threadId: 'c1', text: 'Done.' }, isRunning: false, isErrored: false, isInterrupted: false, isExpanded: false }
  const row = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'ToolUse', props: call })
  const texts = (await row.findAll({ type: 'Text' })).map(found => found.text)
  expect(texts).toContain('Reply in Chrome  scale CSS property')
  expect(texts).toContain('Done.')
  await row.unmount()
  const result = { tool_use_id: 't1', tool: 'mcp__toolkit__reply_comment', output: 'Added your answer to thread c1.', isErrored: false, isExpanded: false }
  const hidden = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'ToolResult', props: result })
  expect(await hidden.findAll({ type: 'Text' })).toEqual([])
  await hidden.unmount()
  const errored = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'ToolResult', props: { ...result, isErrored: true } })
  expect(await errored.find({ type: 'Text', text: 'engine drawing' })).toBeDefined()
  await errored.unmount()
})

test('a read_tab result is one grey line', async ($, on) => {
  engine(on)
  const result = { tool_use_id: 't2', tool: 'mcp__toolkit__read_tab', output: '<page-content marker="m">\nurl: x\n</page-content marker="m">', isErrored: false, isExpanded: false }
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'ToolResult', props: result })
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['  ⎿  page details and screenshot'])
  await ui.unmount()
})

test('ctrl+o, another plugin\'s prompt and a typed prompt keep the engine\'s drawing', async ($, on) => {
  engine(on)
  const rows: (typeof ROW | { text: string; origin: { kind: 'composer' }; isExpanded: boolean })[] = [
    { ...ROW, isExpanded: true },
    { ...ROW, origin: { kind: 'plugin', name: 'other' } },
    { ...ROW, origin: { kind: 'composer' } },
  ]
  for (const props of rows) {
    const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'UserMessage', props })
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined()
    await ui.unmount()
  }
})
