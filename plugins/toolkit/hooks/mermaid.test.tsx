import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderViewport } from 'claude-code'

import {
  diagramId,
  drawsPictures,
  fitOf,
  isShrunk,
  orientations,
  osThemeOf,
  pick,
  reasonOf,
  rendererFiles,
  split,
  themeOfSetting,
} from './mermaid'
import type { Diagram, Pair, Picture } from '../types'

const DIR = '/home/me/.cache/claude-mermaid'
const SOURCE = 'graph LR\n  A-->B'
const FENCE = '```mermaid\n' + SOURCE + '\n```'
const PICTURE: Picture = { file: `${DIR}/d-light.png`, full: `${DIR}/d-light-full.png`, width: 360, height: 180 }
const PAIR: Pair = { light: PICTURE, dark: { ...PICTURE, file: `${DIR}/d-dark.png`, full: `${DIR}/d-dark-full.png` } }
const SCREEN: RenderViewport = { columns: 100, rows: 40 }

type Size = { width: number; height: number }
type Setup = {
  dir?: string
  diagrams?: Record<string, Diagram>
  theme?: 'light' | 'dark'
  installed?: boolean
  installExit?: number
  // The size the renderer draws a source at; 360 by 180 when absent.
  size?: (source: string) => Size
  refuse?: string
  os?: string
  setting?: string
  colorScheme?: string
}
type Host = { state: Map<string, { value: unknown; version: number }>; files: Map<string, string>; runs: { argv: readonly string[]; cwd?: string }[] }

// Beneath the plugin: the engine's own drawing, the session's state, the /config rows, a disk, npm
// that installs the renderer, the renderer that writes each diagram's sizes unless its source holds
// `refuse`, and the OS's answers.
function engine(on: On, setup: Setup = {}): Host {
  const host: Host = { state: new Map(), files: new Map(), runs: [] }
  const at = (e: { key: string; id?: string }) => `${e.key}:${e.id ?? ''}`
  if (setup.dir) host.state.set('mermaidDir:', { value: setup.dir, version: 1 })
  if (setup.theme) host.state.set('mermaidTheme:', { value: setup.theme, version: 1 })
  for (const [id, diagram] of Object.entries(setup.diagrams ?? {})) host.state.set(`mermaidDiagram:${id}`, { value: diagram, version: 1 })
  const install = () => rendererFiles(DIR).forEach(file => host.files.set(file, ''))
  if (setup.installed) install()
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
  on('config.list', () => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: setup.setting ?? 'auto', provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }))
  on('fs.exists', (_$, e) => ({ value: host.files.has(e.path) }))
  on('fs.write', (_$, e) => {
    host.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', (_$, e) => ({ value: host.files.get(e.path) ?? '' }))
  on('process.run', (_$, e) => {
    host.runs.push({ argv: e.argv, cwd: e.init?.cwd })
    const done = (exitCode: number, stdout = '', stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    const [command, ...args] = e.argv
    if (command === 'uname') return done(0, `${setup.os ?? 'Linux'}\n`)
    if (command === 'gsettings') return setup.colorScheme === undefined ? done(1, '', 'No such schema') : done(0, `${setup.colorScheme}\n`)
    if (command === 'npm') {
      if (setup.installExit) return done(setup.installExit, '', 'npm warn deprecated x\nnpm error code ENOTFOUND')
      install()
      return done(0)
    }
    if (command === 'node') {
      for (let i = 2; i + 1 < args.length; i += 2) {
        const source = host.files.get(args[i] ?? '') ?? ''
        if (setup.refuse && source.includes(setup.refuse)) return done(1, '', 'Error: Parse error on line 2:')
        const size = setup.size?.(source) ?? { width: 360, height: 180 }
        host.files.set(`${args[i + 1]}.json`, JSON.stringify({ light: size, dark: size }))
      }
    }
    return done(0)
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

// The stubbed host does not push its writes to the drawing, and the queued renderer run settles over
// several host calls: move the clock, then let them land.
async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(1)
  for (let i = 0; i < 80; i++) await Promise.resolve()
}

const runsOf = (host: Host, command: string) => host.runs.filter(run => run.argv[0] === command)

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
  const pie = 'Before.\n\n```mermaid\npie\n  "a": 1\n```\n\nAfter.'
  expect(split(pie)).toEqual([{ kind: 'text', text: pie }])
  expect(split('Streaming:\n```mermaid\ngraph LR\n  A-->')).toEqual([{ kind: 'text', text: 'Streaming:\n```mermaid\ngraph LR\n  A-->' }])
  expect(split('  1. list\n     indented\n\n' + FENCE)[0]).toEqual({ kind: 'text', text: '  1. list\n     indented' })
})

test('orientations turns a flowchart the other way, past frontmatter and directives, and leaves other types alone', () => {
  expect(orientations('flowchart TD\n  A-->B')).toEqual({ source: 'flowchart TD\n  A-->B', turned: 'flowchart LR\n  A-->B' })
  expect(orientations('graph LR;\n  A-->B')).toEqual({ source: 'graph LR;\n  A-->B', turned: 'graph TD;\n  A-->B' })
  expect(orientations('---\ntitle: x\n---\n%%{init: {}}%%\ngraph RL\n  A-->B').turned).toBe('---\ntitle: x\n---\n%%{init: {}}%%\ngraph TD\n  A-->B')
  expect(orientations('graph\n  A-->B')).toEqual({ source: 'graph TD\n  A-->B', turned: 'graph LR\n  A-->B' })
  expect(orientations('sequenceDiagram\n  A->>B: hi')).toEqual({ source: 'sequenceDiagram\n  A->>B: hi' })
})

test('fitOf keeps the natural size, shrinks to the width and to half the height, and keeps the shape', () => {
  expect(fitOf(PICTURE, SCREEN)).toMatchObject({ columns: 18, rows: 4, scale: 1 })
  expect(fitOf({ ...PICTURE, width: 3840, height: 304 }, { columns: 100, rows: 60 })).toMatchObject({ columns: 96, rows: 4, scale: 0.5 })
  const tall = fitOf({ ...PICTURE, width: 546, height: 2951 }, SCREEN)
  expect(tall.rows).toBe(20)
  expect(tall.columns).toBe(Math.round(27.3 * tall.scale))
  expect(fitOf({ ...PICTURE, width: 546, height: 2951 }, { columns: 100, rows: 10 }).rows).toBe(8)
})

test('pick shows the way of a flowchart that draws larger, and isShrunk flags one below 60%', () => {
  const tall: Pair = { light: { ...PICTURE, width: 546, height: 2951 }, dark: { ...PICTURE, width: 546, height: 2951 } }
  const wide: Pair = { light: { ...PICTURE, file: 'lr', width: 2400, height: 300 }, dark: { ...PICTURE, file: 'lr', width: 2400, height: 300 } }
  expect(pick({ status: 'drawn', ...tall, turned: wide }, SCREEN).pair).toBe(wide)
  expect(pick({ status: 'drawn', ...wide, turned: tall }, SCREEN).pair).toEqual(wide)
  expect(pick({ status: 'drawn', ...PAIR }, SCREEN)).toMatchObject({ pair: PAIR, fit: { scale: 1 } })
  expect(isShrunk(fitOf(tall.light, SCREEN))).toBe(true)
  expect(isShrunk(fitOf(PICTURE, SCREEN))).toBe(false)
})

test('reasonOf shows the error, not npm warnings', () => {
  expect(reasonOf('npm warn deprecated x\nnpm error code ENOTFOUND\n...', 'npm', 1)).toBe('npm error code ENOTFOUND')
  expect(reasonOf('npm warn something\n', 'node', 3)).toBe('node exited 3')
})

test('drawsPictures is true in Ghostty and kitty, never through tmux', () => {
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(drawsPictures({ TERM: 'xterm-kitty' })).toBe(true)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux-1/default,1,0' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'vscode', TERM: 'xterm-256color' })).toBe(false)
})

test('the theme follows the setting, and auto follows the OS, dark when the OS does not say', () => {
  expect(themeOfSetting('light-daltonized')).toBe('light')
  expect(themeOfSetting('dark-ansi')).toBe('dark')
  expect(themeOfSetting('auto')).toBeUndefined()
  const ran = (exitCode: number, stdout: string, stderr = '') => ({ exitCode, stdout, stderr })
  expect(osThemeOf('Linux', ran(0, "'prefer-dark'\n"))).toBe('dark')
  expect(osThemeOf('Linux', ran(0, "'default'\n"))).toBe('light')
  expect(osThemeOf('Linux', ran(1, '', 'No such schema'))).toBe('dark')
  expect(osThemeOf('Linux', undefined)).toBe('dark')
  expect(osThemeOf('Darwin', ran(0, 'Dark\n'))).toBe('dark')
  expect(osThemeOf('Darwin', ran(1, '', 'The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist'))).toBe('light')
})

test('session start in Ghostty writes the renderer script, the opener and the OS theme, then the dir', async ($, on) => {
  const host = engine(on, { colorScheme: "'default'" })
  mock.env(on, { HOME: '/home/me', TERM_PROGRAM: 'ghostty' })
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(host.files.get(`${DIR}/render.mjs`)).toContain('beautiful-mermaid')
  expect(host.state.get('mermaidOpener:')?.value).toBe('xdg-open')
  expect(host.state.get('mermaidTheme:')?.value).toBe('light')
  expect(host.state.get('mermaidDir:')?.value).toBe(DIR)
})

test('a switch of the OS theme reaches the state within 5 s, and the setting wins over the OS', async ($, on) => {
  const setup: Setup = { colorScheme: "'default'" }
  const host = engine(on, setup)
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/me', TERM_PROGRAM: 'ghostty' })
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const versionBefore = host.state.get('mermaidTheme:')?.version
  await clock.advance(5000)
  expect(host.state.get('mermaidTheme:')?.version).toBe(versionBefore)

  setup.colorScheme = "'prefer-dark'"
  await clock.advance(5000)
  expect(host.state.get('mermaidTheme:')?.value).toBe('dark')

  setup.setting = 'light'
  await clock.advance(5000)
  expect(host.state.get('mermaidTheme:')?.value).toBe('light')
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

test('a drawn diagram shows the picture for the theme in the engine frame', async ($, on) => {
  const diagrams = { [await diagramId(SOURCE)]: { status: 'drawn', ...PAIR } as const }
  engine(on, { dir: DIR, diagrams })
  const ui = await mount($, 'Before.\n\n' + FENCE + '\n\nAfter.', { viewport: SCREEN })
  expect((await ui.find({ type: 'Image' }))?.props).toMatchObject({ source: { file: PAIR.dark.file, format: 'png' }, columns: 18, rows: 4 })
  expect(await ui.find({ type: 'Markdown', text: 'Before.' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'After.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
  expect(await ui.find({ key: 'full-0' })).toBeUndefined()
})

test('in a light theme the light picture is shown', async ($, on) => {
  engine(on, { dir: DIR, theme: 'light', diagrams: { [await diagramId(SOURCE)]: { status: 'drawn', ...PAIR } } })
  const ui = await mount($, FENCE, { viewport: SCREEN })
  expect((await ui.find({ type: 'Image' }))?.props).toMatchObject({ source: { file: PAIR.light.file } })
})

test('a reply with no mermaid block is left to the engine', async ($, on) => {
  engine(on, { dir: DIR })
  const ui = await mount($, 'No diagram here.')
  expect(await ui.find({ type: 'Text', text: /engine drawing/ })).toBeDefined()
})

test('the first diagram installs the pinned renderer, then draws the flowchart both ways in one node run', async ($, on) => {
  const host = engine(on, { dir: DIR })
  const clock = mock.clock(on)
  const ui = await mount($, FENCE, { viewport: SCREEN })
  expect(await ui.find({ type: 'Text', text: /^installing the diagram renderer, once/ })).toBeDefined()
  await ui.redraw()
  await settle(clock)

  expect(runsOf(host, 'npm').map(run => run.argv)).toEqual([
    ['npm', 'install', '--prefix', `${DIR}/renderer`, '--no-audit', '--no-fund', 'beautiful-mermaid@1.1.3', '@resvg/resvg-js@2.6.2'],
  ])
  const id = await diagramId(SOURCE)
  expect(runsOf(host, 'node').map(run => run.argv)).toEqual([
    ['node', `${DIR}/render.mjs`, `${DIR}/renderer`, `${DIR}/${id}.mmd`, `${DIR}/${id}`, `${DIR}/${id}-turned.mmd`, `${DIR}/${id}-turned`],
  ])
  expect(host.files.get(`${DIR}/${id}-turned.mmd`)).toBe('graph TD\n  A-->B')
  expect(host.state.get(`mermaidDiagram:${id}`)?.value).toMatchObject({ status: 'drawn', dark: { file: `${DIR}/${id}-dark.png`, width: 360 } })
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeDefined()
})

test('an installed renderer is not installed again, and pictures already on disk are not drawn again', async ($, on) => {
  const host = engine(on, { dir: DIR, installed: true })
  const clock = mock.clock(on)
  const id = await diagramId(SOURCE)
  for (const name of [id, `${id}-turned`]) host.files.set(`${DIR}/${name}.json`, JSON.stringify({ light: { width: 360, height: 180 }, dark: { width: 360, height: 180 } }))
  await mount($, FENCE)
  await settle(clock)
  expect(runsOf(host, 'npm')).toHaveLength(0)
  expect(runsOf(host, 'node')).toHaveLength(0)
  expect(host.state.get(`mermaidDiagram:${id}`)?.value).toMatchObject({ status: 'drawn', turned: { light: { file: `${DIR}/${id}-turned-light.png` } } })
})

test('a long flowchart is capped at half the screen, turned when that shows it larger, and offers the full size', async ($, on) => {
  const source = 'flowchart TD\n' + Array.from({ length: 17 }, (_, i) => `  S${i}-->S${i + 1}`).join('\n')
  const host = engine(on, { dir: DIR, installed: true, size: drawn => (drawn.startsWith('flowchart LR') ? { width: 4800, height: 300 } : { width: 546, height: 2951 }) })
  const clock = mock.clock(on)
  const ui = await mount($, '```mermaid\n' + source + '\n```', { viewport: SCREEN })
  await settle(clock)
  await ui.redraw()
  const id = await diagramId(source)
  const image = await ui.find({ type: 'Image' })
  expect(image?.props).toMatchObject({ source: { file: `${DIR}/${id}-turned-dark.png` } })
  expect(Number(image?.props.rows)).toBeLessThanOrEqual(20)

  await ui.press({ key: 'full-0' })
  expect(host.runs.at(-1)?.argv).toEqual(['xdg-open', `${DIR}/${id}-turned-dark-full.png`])
})

test('a diagram the renderer refuses keeps its source, says why, and Retry draws it again', async ($, on) => {
  const host = engine(on, { dir: DIR, installed: true, refuse: 'A-->B' })
  const clock = mock.clock(on)
  const ui = await mount($, 'More.\n\n' + FENCE, { first: false })
  await settle(clock)
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'mermaid: Error: Parse error on line 2:' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeUndefined()

  await ui.press({ key: 'retry-1' })
  await settle(clock)
  expect(runsOf(host, 'node')).toHaveLength(2)
})

test('a failed install keeps the source and says why', async ($, on) => {
  engine(on, { dir: DIR, installExit: 1 })
  const clock = mock.clock(on)
  const ui = await mount($, FENCE)
  await settle(clock)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: 'mermaid: npm error code ENOTFOUND' })).toBeDefined()
})

test('a reply whose only diagram is of a type the renderer does not draw is left to the engine, and nothing runs', async ($, on) => {
  const host = engine(on, { dir: DIR })
  const clock = mock.clock(on)
  const ui = await mount($, 'A pie.\n\n```mermaid\npie\n  "a": 1\n```')
  await settle(clock)
  expect(await ui.find({ type: 'Text', text: /engine drawing/ })).toBeDefined()
  expect(host.runs).toHaveLength(0)
})

test('the link under a diagram switches it to its source and back', async ($, on) => {
  engine(on, { dir: DIR, diagrams: { [await diagramId(SOURCE)]: { status: 'drawn', ...PAIR } } })
  const ui = await mount($, FENCE)

  await ui.press({ key: 'toggle-0' })
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: FENCE })).toBeDefined()
  expect((await ui.find({ key: 'toggle-0' }))?.props).toMatchObject({ label: 'Show picture', plain: true, dimColor: true })

  await ui.press({ key: 'toggle-0' })
  await ui.redraw()
  expect(await ui.find({ type: 'Image' })).toBeDefined()
})
