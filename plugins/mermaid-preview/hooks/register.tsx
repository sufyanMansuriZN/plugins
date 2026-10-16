import { read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

import type { Diagram, Picture } from '../types'

// mmdc draws at scale 2, and a cell is about 10 by 21 px at a common font size, so one picture
// px per screen px keeps every diagram's text the same size as the next one's.
const SCALE = 2
const CELL_W = 10
const CELL_H = 21
// The Image element takes 1 to 255 cells each way.
const MAX_CELLS = 255
// The reply's bullet column and the picture's own indent, two columns each.
const FRAME_COLUMNS = 4
const MIN_COLUMNS = 10
const MIN_ROWS = 3
// A diagram up to this much wider than the terminal is shrunk to fit; past it, a flowchart drawn
// top to bottom is used instead when there is one.
const SHRINK_LIMIT = 1.15
// The first run downloads mermaid-cli and Chromium.
const MMDC_TIMEOUT_MS = 300_000
const MMDC = '@mermaid-js/mermaid-cli@12.0.0'
// Part of every diagram's id, bumped when the drawing settings change so old pictures are not reused.
const LOOK = 'v3'
const MERMAID_CONFIG = {
  theme: 'neutral',
  securityLevel: 'strict',
  flowchart: { useMaxWidth: false, htmlLabels: false, nodeSpacing: 40, rankSpacing: 50, padding: 12 },
  sequence: { useMaxWidth: false },
  class: { useMaxWidth: false },
  state: { useMaxWidth: false },
  er: { useMaxWidth: false },
  gantt: { useMaxWidth: false },
}
// Chromium draws model-written text: an unroutable proxy keeps a label's <img src> off the network.
// The sandbox is off because Ubuntu's AppArmor refuses it to a Chromium not installed as root.
const PUPPETEER_CONFIG = {
  args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'],
}
const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n'
const OPENER = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/
const BLANK_OR_COMMENT = /^\s*(%%.*)?$/

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

/** The same flowchart drawn top to bottom, or undefined when it is not a sideways flowchart. */
export function upright(source: string): string | undefined {
  const lines = source.split('\n')
  let at = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end === -1) return undefined
    at = end + 1
  }
  while (at < lines.length && BLANK_OR_COMMENT.test(lines[at] ?? '')) at++
  const header = lines[at]
  const turned = header?.replace(/^(\s*(?:flowchart|graph)\s+)(LR|RL)\b/, '$1TD')
  if (header === undefined || turned === undefined || turned === header) return undefined
  lines[at] = turned
  return lines.join('\n')
}

/** Width and height from a PNG's base64 bytes, or undefined when they do not open a whole PNG. */
export function pngSize(base64: string): { width: number; height: number } | undefined {
  const bytes = atob(base64.slice(0, 32))
  if (bytes.length < 24 || !bytes.startsWith(PNG_SIGNATURE)) return undefined
  const at = (i: number) => ((bytes.charCodeAt(i) << 24) | (bytes.charCodeAt(i + 1) << 16) | (bytes.charCodeAt(i + 2) << 8) | bytes.charCodeAt(i + 3)) >>> 0
  const width = at(16)
  const height = at(20)
  return width > 0 && height > 0 ? { width, height } : undefined
}

const columnsOf = (picture: Picture) => Math.round(picture.width / SCALE / CELL_W)

/** The picture for a terminal this many columns wide: the upright one only when the other is far too wide. */
export function pick(diagram: Extract<Diagram, { status: 'drawn' }>, columns: number): Picture {
  const { picture, upright } = diagram
  if (!upright || columnsOf(picture) <= (columns - FRAME_COLUMNS) * SHRINK_LIMIT) return picture
  return columnsOf(upright) < columnsOf(picture) ? upright : picture
}

/** The cells a picture takes: its natural size, shrunk to the room, its shape kept. */
export function cellsOf(picture: Picture, columns: number): { columns: number; rows: number } {
  const room = Math.max(MIN_COLUMNS, columns - FRAME_COLUMNS)
  const across = Math.min(MAX_CELLS, room, Math.max(MIN_COLUMNS, columnsOf(picture)))
  const down = Math.round((across * CELL_W * picture.height) / (picture.width * CELL_H))
  return { columns: across, rows: Math.min(MAX_CELLS, Math.max(MIN_ROWS, down)) }
}

/** The line of mmdc's error output worth showing, past npm's own warnings. */
export function reasonOf(stderr: string, exitCode: number): string {
  const lines = stderr.split('\n').map(line => line.trim()).filter(line => line && !/^npm (warn|notice)/i.test(line))
  return lines.find(line => /error/i.test(line)) ?? lines[0] ?? `mmdc exited ${exitCode}`
}

export type TerminalEnv = { TERM_PROGRAM?: string; TERM?: string; KITTY_WINDOW_ID?: string; TMUX?: string }

/** Whether the terminal draws the kitty graphics protocol; tmux passes none of it through. */
export function drawsPictures(env: TerminalEnv): boolean {
  if (env.TMUX) return false
  return env.TERM_PROGRAM === 'ghostty' || env.TERM === 'xterm-ghostty' || env.TERM === 'xterm-kitty' || Boolean(env.KITTY_WINDOW_ID)
}

export const register: Register = on => {
  // The diagrams this load of the module has asked mmdc for, and the one mmdc run at a time.
  const started = new Set<string>()
  let queue: Promise<unknown> = Promise.resolve()

  on('session.start', async ($, e, next) => {
    const env: TerminalEnv = {
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      TERM: await $.env.get('TERM'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      TMUX: await $.env.get('TMUX'),
    }
    if (drawsPictures(env)) {
      const dir = `${await $.env.get('HOME')}/.cache/claude-mermaid`
      await $.fs.write(`${dir}/puppeteer.json`, JSON.stringify(PUPPETEER_CONFIG))
      await $.fs.write(`${dir}/mermaid.json`, JSON.stringify(MERMAID_CONFIG))
      // Set last: a reply drawn before it reads no dir, is left to the engine, and redraws once set.
      await $.state.set({ plugin: 'mermaid-preview', key: 'dir' }, dir)
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary || !e.props.text.includes('```mermaid')) return next(e)
    const parts = split(e.props.text)
    if (!parts.some(part => part.kind === 'mermaid')) return next(e)
    const dir = await read($, { plugin: 'mermaid-preview', key: 'dir' } as const)
    if (!dir) return next(e)

    const { Box, Button, Image, Markdown, Text } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 80

    const drawn = await Promise.all(
      parts.map(async (part, index) => {
        if (part.kind === 'text') return <Markdown text={part.text} />
        const id = await diagramId(part.source)
        const diagramRef = { plugin: 'mermaid-preview', key: 'diagram', id } as const
        const sourceRef = { plugin: 'mermaid-preview', key: 'isSource', id: `${e.requestId}:${index}` } as const

        // Draws the diagram, and a sideways flowchart too wide for this terminal top to bottom as well,
        // then stores the outcome.
        const schedule = () => {
          if (started.has(id)) return
          started.add(id)
          $.clock.after(0, () => {
            queue = queue.then(async () => {
              const draw = async (name: string, source: string): Promise<Picture | string> => {
                const png = `${dir}/${name}.png`
                if (await $.fs.exists(png)) {
                  const size = pngSize((await $.fs.read(png, { as: 'bytes' })).base64)
                  if (size) return { file: png, ...size }
                }
                await $.fs.write(`${dir}/${name}.mmd`, source)
                const run = await $.process.run(
                  ['npx', '-y', '--prefer-offline', '-p', MMDC, 'mmdc', '-q', '-p', `${dir}/puppeteer.json`, '-c', `${dir}/mermaid.json`,
                    '-i', `${dir}/${name}.mmd`, '-o', `${dir}/${name}.part.png`, '-s', String(SCALE), '-b', 'white'],
                  { cwd: dir, timeoutMs: MMDC_TIMEOUT_MS },
                )
                if (run.exitCode !== 0) return reasonOf(run.stderr, run.exitCode)
                // Renamed into place whole, so a run cut short never leaves a picture to reuse.
                await $.process.run(['mv', '-f', `${dir}/${name}.part.png`, png], { cwd: dir })
                const size = pngSize((await $.fs.read(png, { as: 'bytes' })).base64)
                return size ? { file: png, ...size } : 'mmdc wrote no picture'
              }
              let outcome: Diagram
              try {
                const picture = await draw(id, part.source)
                const turnedSource = typeof picture === 'string' || columnsOf(picture) <= columns - FRAME_COLUMNS ? undefined : upright(part.source)
                const turned = turnedSource === undefined ? undefined : await draw(`${id}-td`, turnedSource)
                outcome = typeof picture === 'string'
                  ? { status: 'failed', reason: picture }
                  : { status: 'drawn', picture, ...(turned && typeof turned !== 'string' ? { upright: turned } : {}) }
              } catch (err) {
                outcome = { status: 'failed', reason: String(err) }
              }
              await $.state.set(diagramRef, outcome)
            })
          })
        }

        const withSource = (note: string, button?: RenderElement) => (
          <Box flexDirection="column" marginY={1}>
            <Markdown text={part.fence} />
            {note ? <Text dimColor>{note}</Text> : null}
            {button ?? null}
          </Box>
        )
        const diagram = await read($, diagramRef)
        if (!diagram) {
          schedule()
          return withSource('drawing diagram…')
        }
        if (diagram.status === 'failed') {
          const retry = () => {
            started.delete(id)
            schedule()
          }
          return withSource(`mermaid: ${diagram.reason}`, <Button key={`retry-${index}`} label="Retry" dimColor onPress={retry} />)
        }
        const toggle = (label: string) => (
          <Button key={`toggle-${index}`} label={label} dimColor onPress={() => update($, sourceRef, was => !was)} />
        )
        if (await read($, sourceRef)) return withSource('', toggle('Show picture'))
        const picture = pick(diagram, columns)
        return (
          <Box flexDirection="column" marginY={1}>
            <Box marginLeft={2}>
              <Image source={{ file: picture.file, format: 'png' }} {...cellsOf(picture, columns)} alt={part.fence} />
            </Box>
            {toggle('Show source')}
          </Box>
        )
      }),
    )

    // The engine's frame for a reply block: a blank row above, a bullet on the first block, every
    // block indented two columns.
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box width={2} minWidth={2}>
          <Text>{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {drawn}
        </Box>
      </Box>
    )
  })
}
