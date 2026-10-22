import type { Register } from 'claude-code'

import type { Diagram, Pair, Picture, Theme } from '../types'
import { RENDER_MJS } from './render'

// render.mjs draws at zoom 2, and a cell is about 10 by 21 px at a common font size, so one picture
// px per screen px keeps every diagram's text the same size as the next one's.
const SCALE = 2
const CELL_W = 10
const CELL_H = 21
// The Image element takes 1 to 255 cells each way.
const MAX_CELLS = 255
// The reply's bullet column and the picture's own indent, two columns each.
const FRAME_COLUMNS = 4
const MIN_COLUMNS = 10
// A diagram takes at most half the screen's height, and never less than this.
const MIN_HEIGHT_CAP = 8
// Below this share of its natural size, a diagram's text is too small to read in place.
const READABLE_SCALE = 0.6
export const INSTALL_TIMEOUT_MS = 300_000
export const RENDER_TIMEOUT_MS = 60_000
export const THEME_CHECK_MS = 5000
const RENDERER_PACKAGES = ['beautiful-mermaid@1.1.3', '@resvg/resvg-js@2.6.2']
// Part of every diagram's id, bumped when the drawing settings change so old pictures are not reused.
const LOOK = 'v4'
// The diagram types beautiful-mermaid draws; it refuses the rest.
const DRAWN_TYPES = new Set(['flowchart', 'graph', 'stateDiagram', 'stateDiagram-v2', 'sequenceDiagram', 'classDiagram', 'erDiagram', 'xychart-beta'])
const OPENER = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/
const BLANK_OR_COMMENT = /^\s*(%%.*)?$/
const FLOWCHART_HEADER = /^(\s*(?:flowchart|graph))(?:\s+(TB|TD|BT|LR|RL))?\b(.*)$/

export type Part = { kind: 'text'; text: string } | { kind: 'mermaid'; source: string; fence: string }

/** Splits reply markdown into text and closed ```mermaid blocks; a fence inside another stays text. */
export function split(text: string): Part[] {
  const parts: Part[] = []
  const lines = text.split('\n')
  let textStart = 0
  const pushText = (end: number) => {
    const chunk = lines.slice(textStart, end).join('\n').replace(/^\n+|\n+$/g, '')
    if (chunk.trim()) parts.push({ kind: 'text', text: chunk })
  }
  for (let i = 0; i < lines.length; i++) {
    const open = OPENER.exec(lines[i] ?? '')
    if (!open) continue
    const marker = open[1] ?? '```'
    const closer = new RegExp(`^[ \\t]{0,3}\\${marker[0]}{${marker.length},}[ \\t]*$`)
    const close = lines.findIndex((line, at) => at > i && closer.test(line))
    // An unclosed fence is still streaming: the engine draws it as it comes.
    if (close === -1) break
    if (open[2] === 'mermaid') {
      pushText(i)
      parts.push({ kind: 'mermaid', source: lines.slice(i + 1, close).join('\n').trim(), fence: lines.slice(i, close + 1).join('\n') })
      textStart = close + 1
    }
    i = close
  }
  pushText(lines.length)
  return parts
}

export async function diagramId(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(LOOK + source))
  // 40 bits: ids only need to tell apart the diagrams of one person's cache.
  return [...new Uint8Array(digest)].slice(0, 5).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** The npm command that installs the renderer into `<dir>/renderer`. */
export function installArgv(dir: string): string[] {
  return ['npm', 'install', '--prefix', `${dir}/renderer`, '--no-audit', '--no-fund', ...RENDERER_PACKAGES]
}

/** What the renderer install leaves behind; when one is missing, it runs again. */
export function rendererFiles(dir: string): string[] {
  return [`${dir}/renderer/node_modules/beautiful-mermaid/dist/index.js`, `${dir}/renderer/node_modules/@resvg/resvg-js/package.json`]
}

/** The node command that draws each `<dir>/<name>.mmd` in both themes (see render.ts). */
export function renderArgv(dir: string, names: string[]): string[] {
  return ['node', `${dir}/render.mjs`, `${dir}/renderer`, ...names.flatMap(name => [`${dir}/${name}.mmd`, `${dir}/${name}`])]
}

/** The light and dark pictures `<dir>/<name>.json` describes, or undefined when it is not whole. */
export function pairOf(dir: string, name: string, json: string): Pair | undefined {
  let sizes: unknown
  try {
    sizes = JSON.parse(json)
  } catch {
    return undefined
  }
  const picture = (theme: Theme): Picture | undefined => {
    const size = (sizes as Record<string, { width?: unknown; height?: unknown } | undefined> | null)?.[theme]
    const { width, height } = size ?? {}
    return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
      ? { file: `${dir}/${name}-${theme}.png`, full: `${dir}/${name}-${theme}-full.png`, width, height }
      : undefined
  }
  const light = picture('light')
  const dark = picture('dark')
  return light && dark ? { light, dark } : undefined
}

// The line that names the diagram type: past frontmatter, blank lines and %% comments.
function headerAt(lines: string[]): number | undefined {
  let at = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end === -1) return undefined
    at = end + 1
  }
  while (at < lines.length && BLANK_OR_COMMENT.test(lines[at] ?? '')) at++
  return at < lines.length ? at : undefined
}

/** The diagram's type, its header's first word: `flowchart`, `sequenceDiagram`, `pie`… */
export function diagramType(source: string): string {
  const lines = source.split('\n')
  const at = headerAt(lines)
  return at === undefined ? '' : (lines[at]?.trim().split(/\s+/)[0] ?? '')
}

/** Whether the renderer draws this type of diagram. */
export function isDrawn(type: string): boolean {
  return DRAWN_TYPES.has(type)
}

/**
 * The source to draw, and for a flowchart the same chart turned: left to right for one drawn top to
 * bottom, top to bottom for one drawn sideways. A flowchart with no direction gets mermaid's
 * default, top to bottom, because the renderer refuses a header without one.
 */
export function orientations(source: string): { source: string; turned?: string } {
  const lines = source.split('\n')
  const at = headerAt(lines)
  const header = FLOWCHART_HEADER.exec(at === undefined ? '' : (lines[at] ?? ''))
  if (at === undefined || !header) return { source }
  const [, start, direction = 'TD', rest] = header
  const turnedDirection = direction === 'LR' || direction === 'RL' ? 'TD' : 'LR'
  const withDirection = (to: string) => lines.map((line, i) => (i === at ? `${start} ${to}${rest}` : line)).join('\n')
  return { source: withDirection(direction), turned: withDirection(turnedDirection) }
}

export type Fit = { columns: number; rows: number; scale: number }

/**
 * The cells a picture takes: its natural size, shrunk to the terminal's width and to half its
 * height, its shape kept. `scale` is the share of its natural size it keeps.
 */
export function fitOf(picture: Picture, viewport: { columns: number; rows: number }): Fit {
  const natural = { columns: picture.width / SCALE / CELL_W, rows: picture.height / SCALE / CELL_H }
  const room = {
    columns: Math.min(MAX_CELLS, Math.max(MIN_COLUMNS, viewport.columns - FRAME_COLUMNS)),
    rows: Math.min(MAX_CELLS, Math.max(MIN_HEIGHT_CAP, Math.floor(viewport.rows / 2))),
  }
  const scale = Math.min(1, room.columns / natural.columns, room.rows / natural.rows)
  return {
    columns: Math.max(1, Math.round(natural.columns * scale)),
    rows: Math.max(1, Math.round(natural.rows * scale)),
    scale,
  }
}

/** Whether a picture at this fit is too small to read, so it offers to open at full size. */
export function isShrunk(fit: Fit): boolean {
  return fit.scale < READABLE_SCALE
}

/** The way of the diagram that shows larger in this terminal: as written, or turned. */
export function pick(diagram: Extract<Diagram, { status: 'drawn' }>, viewport: { columns: number; rows: number }): { pair: Pair; fit: Fit } {
  const { light, dark, turned } = diagram
  const written = { pair: { light, dark }, fit: fitOf(light, viewport) }
  if (!turned) return written
  const other = { pair: turned, fit: fitOf(turned.light, viewport) }
  return other.fit.scale > written.fit.scale ? other : written
}

/** The line of a command's error output worth showing, past npm's own warnings. */
export function reasonOf(stderr: string, command: string, exitCode: number): string {
  const lines = stderr.split('\n').map(line => line.trim()).filter(line => line && !/^npm (warn|notice)/i.test(line))
  return lines.find(line => /error/i.test(line)) ?? lines[0] ?? `${command} exited ${exitCode}`
}

export type TerminalEnv = { TERM_PROGRAM?: string; TERM?: string; KITTY_WINDOW_ID?: string; TMUX?: string }

/** Whether the terminal draws the kitty graphics protocol; tmux passes none of it through. */
export function drawsPictures(env: TerminalEnv): boolean {
  if (env.TMUX) return false
  return env.TERM_PROGRAM === 'ghostty' || env.TERM === 'xterm-ghostty' || env.TERM === 'xterm-kitty' || Boolean(env.KITTY_WINDOW_ID)
}

/** The command that opens a file in the person's own viewer, by `uname -s`. */
export function openerOf(os: string): string {
  return os === 'Darwin' ? 'open' : 'xdg-open'
}

/** The theme Claude Code's `theme` setting names, or undefined for `auto`, which follows the OS. */
export function themeOfSetting(setting: string): Theme | undefined {
  if (setting.startsWith('light')) return 'light'
  if (setting.startsWith('dark')) return 'dark'
  return undefined
}

/** The command that asks the OS for its light or dark preference, by `uname -s`. */
export function osThemeArgv(os: string): string[] {
  return os === 'Darwin' ? ['defaults', 'read', '-g', 'AppleInterfaceStyle'] : ['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme']
}

/** The OS theme from `osThemeArgv`'s run, or dark when the run failed or said nothing clear. */
export function osThemeOf(os: string, run: { exitCode: number; stdout: string; stderr: string } | undefined): Theme {
  if (!run) return 'dark'
  if (os === 'Darwin') {
    if (run.exitCode === 0) return run.stdout.trim() === 'Dark' ? 'dark' : 'light'
    // macOS has no AppleInterfaceStyle key at all in light mode.
    return /does not exist/.test(run.stderr) ? 'light' : 'dark'
  }
  if (run.exitCode !== 0) return 'dark'
  return run.stdout.includes('prefer-dark') ? 'dark' : 'light'
}

// Readies the cache folder and keeps the theme current. The reply hook in reply.tsx draws the diagrams.
export const register: Register = on => {
  on('session.start', { surface: 'terminal' }, async ($, e, next) => {
    const env: TerminalEnv = {
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      TERM: await $.env.get('TERM'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      TMUX: await $.env.get('TMUX'),
    }
    if (drawsPictures(env)) {
      const dir = `${await $.env.get('HOME')}/.cache/claude-mermaid`
      await $.fs.write(`${dir}/render.mjs`, RENDER_MJS)
      const os = await $.process.run(['uname', '-s']).then(run => run.stdout.trim(), () => '')
      await $.state.set({ plugin: 'toolkit', key: 'mermaidOpener' }, openerOf(os))

      // Written only on a change, so a diagram redraws only when the theme it shows changes.
      let shown: Theme | undefined
      const checkTheme = async () => {
        const setting = (await $.config.list()).find(row => row.key === 'theme')?.value
        const theme =
          themeOfSetting(String(setting ?? '')) ??
          osThemeOf(os, await $.process.run(osThemeArgv(os), { timeoutMs: 2000 }).catch(() => undefined))
        if (theme === shown) return
        shown = theme
        await $.state.set({ plugin: 'toolkit', key: 'mermaidTheme' }, theme)
      }
      await checkTheme()
      // The person's terminal can follow the OS, so a live switch redraws within a few seconds.
      $.clock.every(THEME_CHECK_MS, () => void checkTheme().catch(() => undefined))

      // Set last: a reply drawn before it reads no dir, is left to the engine, and redraws once set.
      await $.state.set({ plugin: 'toolkit', key: 'mermaidDir' }, dir)
    }
    return next(e)
  })
}
