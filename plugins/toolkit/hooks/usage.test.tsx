import { expect, mock, test } from 'claude-code/testing'

const LOG = '/home/me/.claude/toolkit/usage/sess-1.jsonl'

test('each press on a toolkit button adds a line to the session usage log, with no reply text in it', async ($, on) => {
  const files = new Map<string, string>()
  mock.env(on, { HOME: '/home/me' })
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'AssistantMessage', requestId: 'msg-1', props: { text: '> secret draft\n\nAnd:\n\n> second', isFirstOfReply: true } })
  await ui.press({ key: 'quote:1' })
  await ui.press({ key: 'quote:2' })
  await ui.unmount()

  const lines = (files.get(LOG) ?? '').trim().split('\n').map(line => JSON.parse(line))
  expect(lines.map(line => [line.component, line.element])).toEqual([
    ['AssistantMessage', 'quote:1'],
    ['AssistantMessage', 'quote:2'],
  ])
  expect(lines.every(line => !Number.isNaN(Date.parse(line.at)))).toBe(true)
  expect(files.get(LOG)).not.toContain('secret')
})

test('a press still does its work when the log cannot be written', async ($, on) => {
  const copied: string[] = []
  mock.env(on, { HOME: '/home/me' })
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ deny: 'read-only file system' }))
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'AssistantMessage', requestId: 'msg-1', props: { text: '> draft', isFirstOfReply: true } })
  await ui.press({ key: 'quote:1' })
  await ui.unmount()
  expect(copied).toEqual(['draft'])
})
