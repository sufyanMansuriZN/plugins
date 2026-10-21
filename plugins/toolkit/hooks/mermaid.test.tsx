import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderViewport } from 'claude-code'

import { cellsOf, diagramId, drawsPictures, pick, pngSize, reasonOf, split, upright } from './mermaid'
import type { Diagram, Picture } from '../types'

const DIR = '/home/me/.cache/claude-mermaid'
const SOURCE = 'graph LR\n  A-->B'
const FENCE = '```mermaid\n' + SOURCE + '\n```'
const PICTURE: Picture = { file: `${DIR}/d.png`, width: 360, height: 180 }

function png(width: number, height: number): string {
  const be32 = (n: number) => String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
  return btoa('\x89PNG\r\n\x1a\n' + '\0\0\0\rIHDR' + be32(width) + be32(height) + '\x08\x02\0\0\0')
}

type Host = { state: Map<string, { value: unknown; version: number }>; files: Map<string, string>; runs: { argv: readonly string[]; cwd?: string }[] }

// Beneath the plugin: the engine's own drawing, the session's state, and a disk where `npx` writes
// a picture of `width` px unless `exitCode` says it failed.
function engine(on: On, setup: { dir?: string; diagrams?: Record<string, Diagram>; width?: number; exitCode?: number; stderr?: string } = {}): Host {
  const host: Host = { state: new Map(), files: new Map(), runs: [] }
  const at = (e: { key: string; id?: string }) => `${e.key}:${e.id ?? ''}`
  if (setup.dir) host.state.set('mermaidDir:', { value: setup.dir, version: 1 })
  for (const [id, diagram] of Object.entries(setup.diagrams ?? {})) host.state.set(`mermaidDiagram:${id}`, { value: diagram, version: 1 })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine drawing</Text>
  })
  on('state.get', (_$, e) => ({ value: host.state.get(at(e)) ?? { value: undefined, version: 0 } }))
  on('state.set', (_$, e) => {
    const version = (host.state.get(at(e))?.version ?? 0) + 1
    host.state.set(at(e), { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('fs.exists', (_$, e) => ({ value: host.files.has(e.path) }))
  on('fs.write', (_$, e) => {
    host.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', (_$, e) => ({ value: { base64: host.files.get(e.path) ?? '' } }))
  on('process.run', (_$, e) => {
    host.runs.push({ argv: e.argv, cwd: e.init?.cwd })
    const exitCode = e.argv[0] === 'npx' ? (setup.exitCode ?? 0) : 0
    if (e.argv[0] === 'npx' && exitCode === 0) {
      const out = e.argv[e.argv.indexOf('-o') + 1] ?? ''
      const turned = (host.files.get(e.argv[e.argv.indexOf('-i') + 1] ?? '') ?? '').includes('TD')
      host.files.set(out, turned ? png(400, 900) : png(setup.width ?? 360, 180))
    }
    if (e.argv[0] === 'mv') {
      host.files.set(e.argv[3] ?? '', host.files.get(e.argv[2] ?? '') ?? '')
      host.files.delete(e.argv[2] ?? '')
    }
    return { value: { exitCode, stdout: '', stderr: setup.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return host
}

function mount($: Engine, text: string, options: { first?: boolean; viewport?: RenderViewport } = {}) {
  return $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: options.first ?? true },
    viewport: options.viewport,
  })
}

// The stubbed host does not push its writes to the drawing, and the queued mmdc run settles over
// several host calls: move the clock, then let them land.
async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(1)
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

test('split takes closed mermaid fences that open a line, and nothing else', () => {
  expect(split('Before.\n\n' + FENCE + '\n\nAfter.')).toEqual([
    { kind: 'text', text: 'Before.' },
    { kind: 'mermaid', source: SOURCE, fence: FENCE },
    { kind: 'text', text: 'After.' },
  ])
  const prose = 'Wrap it in ```mermaid fences.\n\n```ts\nconst a = 1\n```'
  expect(split(prose)).toEqual([{ kind: 'text', text: prose }])
  const shown = '````markdown\n' + FENCE + '\n````'
  expect(split(shown)).toEqual([{ kind: 'text', text: shown }])
  expect(split('```mermaidjs\nx\n```').some(part => part.kind === 'mermaid')).toBe(false)
  expect(split('Streaming:\n```mermaid\ngraph LR\n  A-->')).toEqual([{ kind: 'text', text: 'Streaming:\n```mermaid\ngraph LR\n  A-->' }])
  expect(split('  1. list\n     indented\n\n' + FENCE)[0]).toEqual({ kind: 'text', text: '  1. list\n     indented' })
})

test('upright turns sideways flowcharts only, past frontmatter and directives', () => {
  expect(upright('flowchart LR\n  A-->B')).toBe('flowchart TD\n  A-->B')
  expect(upright('---\ntitle: x\n---\n%%{init: {}}%%\ngraph RL\n  A-->B')).toBe('---\ntitle: x\n---\n%%{init: {}}%%\ngraph TD\n  A-->B')
  expect(upright('flowchart TD\n  A-->B')).toBeUndefined()
  expect(upright('sequenceDiagram\n  A->>B: hi')).toBeUndefined()
})

test('pngSize reads a whole PNG header and refuses anything else', () => {
  expect(pngSize(png(1104, 206))).toEqual({ width: 1104, height: 206 })
  expect(pngSize('')).toBeUndefined()
  expect(pngSize(btoa('not a png at all, just some text'))).toBeUndefined()
  expect(pngSize(png(0, 10))).toBeUndefined()
})

test('cellsOf keeps the natural size, shrinks to the room and keeps the shape', () => {
  expect(cellsOf(PICTURE, 100)).toEqual({ columns: 18, rows: 4 })
  expect(cellsOf({ ...PICTURE, width: 3240, height: 304 }, 120)).toEqual({ columns: 116, rows: 5 })
  expect(cellsOf({ ...PICTURE, width: 400, height: 20 }, 100).rows).toBe(3)
  expect(cellsOf({ ...PICTURE, width: 20000, height: 20000 }, 400)).toEqual({ columns: 255, rows: 121 })
})

test('pick turns a flowchart upright only when it is far too wide', () => {
  const wide = { ...PICTURE, width: 2300 }
  const tall = { ...PICTURE, file: 'td', width: 700 }
  expect(pick({ status: 'drawn', picture: wide, upright: tall }, 200)).toBe(wide)
  expect(pick({ status: 'drawn', picture: wide, upright: tall }, 105)).toBe(wide)
  expect(pick({ status: 'drawn', picture: wide, upright: tall }, 80)).toBe(tall)
  expect(pick({ status: 'drawn', picture: wide }, 80)).toBe(wide)
})

test('reasonOf shows the error, not npm warnings', () => {
  expect(reasonOf('npm warn exec The following package was not found\nError: Parse error on line 2:\n...', 1)).toBe('Error: Parse error on line 2:')
  expect(reasonOf('npm warn something\n', 3)).toBe('mmdc exited 3')
})

test('drawsPictures is true in Ghostty and kitty, never through tmux', () => {
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(drawsPictures({ TERM: 'xterm-kitty' })).toBe(true)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux-1/default,1,0' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'vscode', TERM: 'xterm-256color' })).toBe(false)
})

test('session start in Ghostty writes the drawing settings with the network blocked, then the dir', async ($, on) => {
  const host = engine(on)
  mock.env(on, { HOME: '/home/me', TERM_PROGRAM: 'ghostty' })
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(host.files.get(`${DIR}/puppeteer.json`)).toContain('--proxy-server=http://127.0.0.1:9')
  expect(host.files.get(`${DIR}/mermaid.json`)).toContain('"htmlLabels":false')
  expect(host.state.get('mermaidDir:')?.value).toBe(DIR)
})

test('session start through tmux leaves every reply to the engine', async ($, on) => {
  const host = engine(on)
  mock.env(on, { HOME: '/home/me', TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux-1/default,1,0' })
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(host.state.has('mermaidDir:')).toBe(false)
  const ui = await mount($, FENCE)
  expect(await ui.find({ type: 'Text', text: /engine drawing/ })).toBeDefined()
})

test('a drawn diagram replaces its fence with a picture in the engine frame', async ($, on) => {
  engine(on, { dir: DIR, diagrams: { [await diagramId(SOURCE)]: { status: 'drawn', picture: PICTURE } } })
  const ui = await mount($, 'Before.\n\n' + FENCE + '\n\nAfter.', { viewport: { columns: 100, rows: 40 } })
  expect((await ui.find({ type: 'Image' }))?.props).toMatchObject({ source: { file: PICTURE.file, format: 'png' }, columns: 18, rows: 4 })
  expect(await ui.find({ type: 'Markdown', text: 'Before.' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'After.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
})

test('a reply with no mermaid block is left to the engine', async ($, on) => {
  engine(on, { dir: DIR })
  const ui = await mount($, 'No diagram here.')
  expect(await ui.find({ type: 'Text', text: /engine drawing/ })).toBeDefined()
})

test('a new diagram is drawn once by a pinned mmdc in the cache dir, then shown', async ($, on) => {
  const host = engine(on, { dir: DIR })
  const clock = mock.clock(on)
  const ui = await mount($, FENCE, { viewport: { columns: 100, rows: 40 } })
  expect(await ui.find({ type: 'Text', text: 'drawing diagram…' })).toBeDefined()
  await ui.redraw()
  await settle(clock)

  const npx = host.runs.filter(run => run.argv[0] === 'npx')
  expect(npx.length).toBe(1)
  expect(npx[0]?.argv).toContain('@mermaid-js/mermaid-cli@12.0.0')
  expect(npx[0]?.cwd).toBe(DIR)
  const id = await diagramId(SOURCE)
  expect(host.state.get(`mermaidDiagram:${id}`)?.value).toEqual({ status: 'drawn', picture: { file: `${DIR}/${id}.png`, width: 360, height: 180 } })
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeDefined()
})

test('a sideways flowchart too wide for the terminal is also drawn upright, and shown upright', async ($, on) => {
  const host = engine(on, { dir: DIR, width: 3240 })
  const clock = mock.clock(on)
  const ui = await mount($, FENCE, { viewport: { columns: 100, rows: 40 } })
  await settle(clock)
  const id = await diagramId(SOURCE)
  expect(host.state.get(`mermaidDiagram:${id}`)?.value).toMatchObject({ upright: { file: `${DIR}/${id}-td.png`, width: 400 } })
  await ui.redraw()
  expect((await ui.find({ type: 'Image' }))?.props).toMatchObject({ source: { file: `${DIR}/${id}-td.png` } })
})

test('a diagram mmdc refuses keeps its source, says why, and Retry draws it again', async ($, on) => {
  const host = engine(on, { dir: DIR, exitCode: 1, stderr: 'npm warn exec x\nError: Parse error on line 2:' })
  const clock = mock.clock(on)
  const ui = await mount($, 'More.\n\n' + FENCE, { first: false })
  await settle(clock)
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'mermaid: Error: Parse error on line 2:' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeUndefined()

  await ui.press({ key: 'retry-1' })
  await settle(clock)
  expect(host.runs.filter(run => run.argv[0] === 'npx').length).toBe(2)
})

test('the button under a diagram switches it to its source and back', async ($, on) => {
  engine(on, { dir: DIR, diagrams: { [await diagramId(SOURCE)]: { status: 'drawn', picture: PICTURE } } })
  const ui = await mount($, FENCE)

  await ui.press({ key: 'toggle-0' })
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: FENCE })).toBeDefined()
  expect((await ui.find({ key: 'toggle-0' }))?.props).toMatchObject({ label: 'Show picture' })

  await ui.press({ key: 'toggle-0' })
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeDefined()
})
