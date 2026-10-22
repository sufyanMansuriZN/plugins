import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { X11_CLIPBOARD_PY } from './clipboard'
import { diagramId } from './mermaid'
import { findTables, toHtml, toTsv } from './tables'
import type { Diagram } from '../types'

const TABLE = ['| Name | Value |', '| --- | ---: |', '| **a** | `x\\|y` |', '| bb | [link](https://e.com) |'].join('\n')
const REPLY = `Here is the data.\n\n${TABLE}\n\nAnd more text.`
const DIR = '/home/me/.cache/claude-mermaid'
const SOURCE = 'graph LR\n  A-->B'
const FENCE = '```mermaid\n' + SOURCE + '\n```'
const PICTURE = { file: `${DIR}/d.png`, full: `${DIR}/d-full.png`, width: 360, height: 180 }
const DRAWN: Diagram = { status: 'drawn', light: PICTURE, dark: PICTURE }

type Host = { copied: string[]; runs: { argv: readonly string[]; stdin?: string }[]; toasts: string[] }
// How the X11 clipboard script ends: its exit code, or the run itself failing (no python3).
type Clipboard = { exitCode: number; hasDir?: boolean } | 'fails to start'

// Beneath the plugin: the engine's own drawing, a session where mermaid already drew SOURCE unless
// `hasDir` is false, a clipboard, and the X11 clipboard script.
async function engine(on: On, clipboard: Clipboard = { exitCode: 0 }): Promise<Host> {
  const host: Host = { copied: [], runs: [], toasts: [] }
  const state = new Map<string, unknown>([[`mermaidDiagram:${await diagramId(SOURCE)}`, DRAWN]])
  if (clipboard === 'fails to start' || clipboard.hasDir !== false) state.set('mermaidDir:', DIR)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine: ${'text' in e.props ? e.props.text : ''}`}</Text>
  })
  on('state.get', (_$, e) => ({ value: { value: state.get(`${e.key}:${e.id ?? ''}`), version: 1 } }))
  on('ui.copy', (_$, e) => {
    host.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('process.run', (_$, e) => {
    host.runs.push({ argv: e.argv, stdin: e.init?.stdin })
    if (clipboard === 'fails to start') throw new Error('python3: not found')
    return { value: { exitCode: clipboard.exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_$, e) => {
    host.toasts.push(e.text)
    return { value: undefined }
  })
  return host
}

function mount($: Engine, text: string, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({ plugin: 'toolkit', surface, component: 'AssistantMessage', requestId: 'msg-1', props: { text, isFirstOfReply: true } })
}

// What the reply shows, top to bottom: its markdown, buttons and pictures.
async function shown(ui: Awaited<ReturnType<typeof mount>>): Promise<string[]> {
  const all = await ui.findAll({})
  return all.flatMap(found => {
    if (found.type === 'Markdown' || found.type === 'Button') return [`${found.type}: ${found.text}`]
    if (found.type === 'Image') return ['Image']
    return []
  })
}

test('the buttons sit right under the table, before the text after it', async ($, on) => {
  await engine(on)
  const ui = await mount($, REPLY)
  expect(await shown(ui)).toEqual([
    'Markdown: Here is the data.',
    `Markdown: ${TABLE}`,
    'Button: copy as markdown',
    'Button: copy table',
    'Markdown: And more text.',
  ])
  expect((await ui.findAll({ type: 'Button' })).map(button => button.key)).toEqual(['md:1', 'rich:1'])
  expect(await ui.findAll({ type: 'Text', text: '●' })).toHaveLength(1)
  await ui.unmount()
})

test('each button copies its format', async ($, on) => {
  const host = await engine(on)
  const ui = await mount($, REPLY)
  await ui.press({ key: 'md:1' })
  await ui.press({ key: 'rich:1' })
  const table = findTables(REPLY)[0]!
  expect(host.copied).toEqual([TABLE])
  expect(host.runs).toEqual([
    { argv: ['python3', '-I', '-c', X11_CLIPBOARD_PY], stdin: JSON.stringify({ text: toTsv(table), html: toHtml(table) }) },
  ])
  expect(host.toasts).toEqual(['Copied table as markdown (2 rows)', 'Copied table (2 rows)'])
  await ui.unmount()
})

for (const [name, clipboard] of [['with no X11 clipboard', { exitCode: 2 }], ['when python3 does not start', 'fails to start']] as const) {
  test(`${name}, copy table falls back to tab-separated cells`, async ($, on) => {
    const host = await engine(on, clipboard)
    const ui = await mount($, REPLY)
    await ui.press({ key: 'rich:1' })
    expect(host.copied).toEqual(['Name\tValue\na\tx|y\nbb\tlink'])
    expect(host.toasts).toEqual(['Copied table as tab-separated cells (a formatted copy needs an X11 desktop) (2 rows)'])
    await ui.unmount()
  })
}

test('a reply with two tables names each in its toast', async ($, on) => {
  const host = await engine(on)
  const ui = await mount($, `${REPLY}\n\n${TABLE}`)
  await ui.press({ key: 'rich:2' })
  expect(host.toasts).toEqual(['Copied table 2 (2 rows)'])
  await ui.unmount()
})

test('desktop and replies without a table are left to the engine', async ($, on) => {
  await engine(on)
  for (const [surface, text] of [['desktop', REPLY], ['terminal', 'No table | here.']] as const) {
    const ui = await mount($, text, surface)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await ui.find({ type: 'Text', text: /engine:/ }))?.text).toBe(`engine: ${text}`)
    await ui.unmount()
  }
})

test('a placeholder reply after a next step box draws nothing, and a short real reply still draws', async ($, on) => {
  await engine(on)
  for (const text of ['_', '​', ' . ']) {
    const ui = await mount($, text)
    expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
    await ui.unmount()
  }
  const ok = await mount($, 'OK')
  expect((await ok.find({ type: 'Text', text: /engine:/ }))?.text).toBe('engine: OK')
  await ok.unmount()
})

test('a summary is left to the engine', async ($, on) => {
  await engine(on)
  const ui = await $.ui.mount({ plugin: 'toolkit', surface: 'terminal', component: 'AssistantMessage', props: { text: REPLY, isFirstOfReply: true, isSummary: true } })
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})

const DRAFT = '> Hi Ana,\n>\n> The fix is in **main**.\n>> done?'

test('copy text under a quote copies it without the quote marks', async ($, on) => {
  const host = await engine(on)
  const ui = await mount($, `Draft:\n\n${DRAFT}\n\nSend it?`)
  expect(await shown(ui)).toEqual(['Markdown: Draft:', `Markdown: ${DRAFT}`, 'Button: copy text', 'Markdown: Send it?'])
  await ui.press({ key: 'quote:1' })
  expect(host.copied).toEqual(['Hi Ana,\n\nThe fix is in **main**.\n> done?'])
  expect(host.runs).toEqual([])
  expect(host.toasts).toEqual(['Copied quote (4 lines)'])
  await ui.unmount()
})

test('a reply with two quotes names each in its toast', async ($, on) => {
  const host = await engine(on)
  const ui = await mount($, `> first\n\nAnd:\n\n> second`)
  await ui.press({ key: 'quote:2' })
  expect(host.copied).toEqual(['second'])
  expect(host.toasts).toEqual(['Copied quote 2 (1 line)'])
  await ui.unmount()
})

test('a reply with text, a table and a diagram draws both, under one bullet', async ($, on) => {
  await engine(on)
  const ui = await mount($, `${REPLY}\n\n${FENCE}`, )
  expect(await shown(ui)).toEqual([
    'Markdown: Here is the data.',
    `Markdown: ${TABLE}`,
    'Button: copy as markdown',
    'Button: copy table',
    'Markdown: And more text.',
    'Image',
    'Button: Show source',
  ])
  expect(await ui.findAll({ type: 'Text', text: '●' })).toHaveLength(1)
  await ui.unmount()
})

test('before session start finds a terminal that draws pictures, the fence stays text and the table keeps its buttons', async ($, on) => {
  await engine(on, { exitCode: 0, hasDir: false })
  const ui = await mount($, `${REPLY}\n\n${FENCE}`)
  expect(await shown(ui)).toEqual([
    'Markdown: Here is the data.',
    `Markdown: ${TABLE}`,
    'Button: copy as markdown',
    'Button: copy table',
    `Markdown: And more text.\n\n${FENCE}`,
  ])
  await ui.unmount()
})
