import type { EngineInterface } from 'claude-code'

import { openerOf } from './mermaid'

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

// A code span that may name a file: no spaces, a slash or an extension, an optional :line, :line:column or :line-line.
const SPAN = /(?<![`[])`([^`\s]+?)(?::(\d+)(?:[-:]\d+)?)?`(?!`)/g
// Any indent: a fence inside a list item is indented past the three spaces of a top-level one.
const FENCE = /^\s*(`{3,}|~{3,})/

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

// Whether a span names a file, by reply, session folder and span, so a reply drawn again while it streams stats nothing twice.
// A later reply looks again: a file the first one only named may exist by then.
const named = new Map<string, string | null>()

/** The spans in `texts`, the reply `requestId`'s text, that name an existing file or folder, each with its link (written → href). */
export async function fileLinks($: EngineInterface, texts: string[], requestId: string): Promise<Map<string, string>> {
  const spans = texts.flatMap(fileSpans)
  const found = new Map<string, string>()
  if (spans.length === 0) return found
  const cwd = await $.session.cwd()
  const home = (await $.env.get('HOME')) ?? ''
  for (const span of spans) {
    const key = `${requestId}\0${cwd}\0${span.written}`
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
