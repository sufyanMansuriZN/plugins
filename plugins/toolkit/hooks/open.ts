import type { EngineInterface } from 'claude-code'

import { openerOf } from './mermaid'

/** What decides where a background session can open: the OS and the terminal Claude Code runs in. */
export type Terminal = { os: string; tmux?: string; tmuxPane?: string; termProgram?: string; termVersion?: string }

/** A place beside this session that the terminal lets another program open. */
export type Place = 'pane' | 'tab' | 'popup' | 'window'

/** The session a row opens: `claude attach` takes the short id. */
export type Attachable = { id: string; name: string; cwd: string }

export async function terminalOf($: EngineInterface): Promise<Terminal> {
  const os = await $.process.run(['uname', '-s']).then(run => run.stdout.trim(), () => '')
  return {
    os,
    tmux: await $.env.get('TMUX'),
    tmuxPane: await $.env.get('TMUX_PANE'),
    termProgram: await $.env.get('TERM_PROGRAM'),
    termVersion: await $.env.get('TERM_PROGRAM_VERSION'),
  }
}

const atLeast = (version: string | undefined, major: number, minor: number) => {
  const [a = 0, b = 0] = (version ?? '').split('.').map(Number)
  return a > major || (a === major && b >= minor)
}

/**
 * The places this terminal can open, best first. tmux opens a pane, a window (a tab) or a popup;
 * Ghostty on Linux only a window, and a tab from 1.4 (`+new-tab`). Elsewhere none: here and copy remain.
 */
export function placesOf(terminal: Terminal): Place[] {
  if (terminal.tmux) return ['pane', 'tab', 'popup']
  if (terminal.termProgram === 'ghostty' && terminal.os === 'Linux') return atLeast(terminal.termVersion, 1, 4) ? ['tab', 'window'] : ['window']
  return []
}

/** The command that opens `session` in `place`. */
export function openArgv(terminal: Terminal, place: Place, session: Attachable): string[] {
  const attach = ['claude', 'attach', session.id]
  if (terminal.tmux) {
    const pane = terminal.tmuxPane ? ['-t', terminal.tmuxPane] : []
    if (place === 'pane') return ['tmux', 'split-window', '-h', ...pane, '-c', session.cwd, ...attach]
    if (place === 'popup') return ['tmux', 'display-popup', ...pane, '-E', '-w', '90%', '-h', '90%', '-d', session.cwd, attach.join(' ')]
    // new-window takes no pane: it opens in this session, which TMUX names.
    return ['tmux', 'new-window', '-n', session.name, '-c', session.cwd, ...attach]
  }
  if (place === 'tab') return ['ghostty', '+new-tab', `--working-directory=${session.cwd}`, `--title=${session.name}`, '-e', ...attach]
  return ['ghostty', '+new-window', `--working-directory=${session.cwd}`, '-e', ...attach]
}

// Files a person views rather than edits: they open in the desktop's own app for their type.
const VIEWED = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|svg|pdf|html?|mp3|mp4|m4a|mov|webm|wav|ogg|zip|docx?|xlsx?|pptx?|odt|ods|odp)$/i
// Editors that draw in a terminal: a click has no terminal to give them, so the file opens in the desktop's app.
const IN_TERMINAL = new Set(['vi', 'vim', 'nvim', 'nano', 'pico', 'emacs', 'micro', 'hx', 'helix', 'kak', 'joe', 'ne', 'ed', 'mcedit'])
// Flags that keep an editor's command running until the file closes; a click must not wait.
const WAIT_FLAGS = new Set(['--wait', '-w'])

/**
 * The command that opens `path` (at `line`, where the editor takes one): folders and viewed files in
 * the desktop's app, other files in the person's graphical editor (`$VISUAL`, else `$EDITOR`).
 */
export function fileArgv(path: string, line: number | undefined, os: string, editor: string | undefined, isDir: boolean): string[] {
  const opener = [openerOf(os), path]
  const words = (editor ?? '').trim().split(/\s+/).filter(word => word && !WAIT_FLAGS.has(word))
  const [command, ...flags] = words
  if (isDir || VIEWED.test(path) || !command) return opener
  const name = command.split('/').at(-1) ?? command
  if (IN_TERMINAL.has(name)) return opener
  const at = line ? `${path}:${line}` : path
  if (/^(code|code-insiders|codium|cursor|windsurf)$/.test(name)) return [command, ...flags, '-g', at]
  if (/^(zed|zeditor|subl|sublime_text)$/.test(name)) return [command, ...flags, at]
  return [command, ...flags, path]
}

// A code span that may name a file: no spaces, a slash or an extension, an optional :line[:column].
const SPAN = /(?<![`[])`([^`\s]+?)(?::(\d+)(?::\d+)?)?`(?!`)/g
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/** A code span in reply text that names a file, as written and as the path it names. */
export type FileSpan = { written: string; path: string; line?: number }

/** The code spans in `text` outside fences that look like paths. */
export function fileSpans(text: string): FileSpan[] {
  const spans: FileSpan[] = []
  let fence: string | undefined
  for (const row of text.split('\n')) {
    const marker = FENCE.exec(row)?.[1]
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker
      continue
    }
    if (fence) continue
    for (const match of row.matchAll(SPAN)) {
      const [written, path = '', line] = match
      if (path.includes('://') || path.startsWith('-') || !/[/.]/.test(path) || /^\.+$/.test(path)) continue
      spans.push({ written, path, ...(line ? { line: Number(line) } : {}) })
    }
  }
  return spans
}

/** The absolute path a span's path names, from the session's folder; `~/` is the home folder. */
export function absolute(path: string, cwd: string, home: string): string {
  if (path.startsWith('/')) return path
  if (path === '~' || path.startsWith('~/')) return `${home}${path.slice(1)}`
  return `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`
}

/** The link a span becomes: `file://` and the path, `#L` and the line. */
export const fileHref = (abs: string, line?: number) => `file://${encodeURI(abs)}${line ? `#L${line}` : ''}`

/** The path and line a link made by fileHref names. */
export function parseHref(href: string): { path: string; line?: number } | undefined {
  const match = /^file:\/\/([^#]+)(?:#L(\d+))?$/.exec(href)
  if (!match?.[1]) return undefined
  return { path: decodeURI(match[1]), ...(match[2] ? { line: Number(match[2]) } : {}) }
}

// Whether a span names a file, by the session folder and the span, so a reply drawn again while it streams stats nothing twice.
const named = new Map<string, string | null>()

/** The spans in `texts` that name an existing file or folder, each with its link (written → href). */
export async function fileLinks($: EngineInterface, texts: string[]): Promise<Map<string, string>> {
  const spans = texts.flatMap(fileSpans)
  const found = new Map<string, string>()
  if (spans.length === 0) return found
  const cwd = await $.session.cwd()
  const home = (await $.env.get('HOME')) ?? ''
  for (const span of spans) {
    const key = `${cwd}\0${span.written}`
    if (!named.has(key)) {
      const abs = absolute(span.path, cwd, home)
      const stat = await $.fs.stat(abs).catch(() => undefined)
      named.set(key, stat && stat.kind !== 'other' ? fileHref(abs, span.line) : null)
    }
    const href = named.get(key)
    if (href) found.set(span.written, href)
  }
  return found
}

/** Opens a link fileLinks made: in the editor at its line, or in the desktop's app; toasts why not. */
export async function openFile($: EngineInterface, href: string) {
  const target = parseHref(href)
  if (!target) return
  const stat = await $.fs.stat(target.path).catch(() => undefined)
  if (!stat) return $.ui.toast(`toolkit: ${target.path} is gone`)
  const os = await $.process.run(['uname', '-s']).then(run => run.stdout.trim(), () => '')
  const editor = (await $.env.get('VISUAL')) || (await $.env.get('EDITOR'))
  const argv = fileArgv(target.path, target.line, os, editor, stat.kind === 'dir')
  const run = await $.process.run(argv, { timeoutMs: 10_000 }).catch((err: unknown) => ({ exitCode: -1, stderr: String(err) }))
  if (run.exitCode !== 0) $.ui.toast(`toolkit: could not open ${target.path} with ${argv[0]}: ${run.stderr.trim().split('\n')[0] || `exit ${run.exitCode}`}`)
}

/**
 * `text` with each span in `found` (written → link) made a link; fences are left as written. Spans
 * outside fences are replaced in order, so a span written twice becomes two links.
 */
export function linkSpans(text: string, found: Map<string, string>): string {
  let fence: string | undefined
  return text
    .split('\n')
    .map(row => {
      const marker = FENCE.exec(row)?.[1]
      if (marker && (!fence || marker.startsWith(fence))) {
        fence = fence ? undefined : marker
        return row
      }
      if (fence) return row
      return row.replace(SPAN, written => {
        const href = found.get(written)
        return href ? `[${written}](${href})` : written
      })
    })
    .join('\n')
}
