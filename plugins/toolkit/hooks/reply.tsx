import { read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Diagram } from '../types'
import { blocks } from './blocks'
import { X11_CLIPBOARD_PY } from './clipboard'
import {
  diagramId,
  INSTALL_TIMEOUT_MS,
  installArgv,
  isShrunk,
  orientations,
  pairOf,
  pick,
  reasonOf,
  renderArgv,
  RENDER_TIMEOUT_MS,
  rendererFiles,
} from './mermaid'
import { toHtml, toTsv } from './tables'

// The one hook that draws a reply. Each tool that draws part of a reply would otherwise take over
// the whole reply, and a second such hook would draw over the first.
export const register: Register = on => {
  // The diagrams this load of the module has asked the renderer for, and the one run at a time.
  const started = new Set<string>()
  let queue: Promise<unknown> = Promise.resolve()

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // $.ui.copy has no path to a remote surface's clipboard yet, and only a terminal draws pictures.
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
    // Empty until session start finds a terminal that draws pictures; till then fences stay text.
    const dir = (e.props.text.includes('```mermaid') ? await read($, { plugin: 'toolkit', key: 'mermaidDir' } as const) : undefined) ?? ''
    const parts = blocks(e.props.text, { mermaid: dir !== '' })
    if (parts.every(part => part.kind === 'text')) return next(e)

    const { Box, Button, Image, Markdown, Text } = $.ui.resolve(e)
    const viewport = { columns: e.viewport?.columns ?? 80, rows: e.viewport?.rows ?? 24 }
    const tableCount = parts.filter(part => part.kind === 'table').length
    const quoteCount = parts.filter(part => part.kind === 'quote').length

    // A plain dim link. hover underlines the nearest keyed Box, so each button gets its own.
    const link = (key: string, label: string, onPress: () => unknown) => (
      <Box key={`hover:${key}`}>
        <Button key={key} plain dimColor hover={{ underline: true }} label={label} onPress={async () => void (await onPress())} />
      </Box>
    )
    const links = (key: string, ...items: ReturnType<typeof link>[]) => (
      <Box key={key} flexDirection="row">
        {items.flatMap((item, i) => (i === 0 ? [item] : [<Text dimColor>{'  ·  '}</Text>, item]))}
      </Box>
    )

    const drawn = await Promise.all(
      parts.map(async (part, index) => {
        if (part.kind === 'text') return <Markdown text={part.text} />
        // No blank row above the first block, so the reply's bullet stands beside its first line.
        const marginTop = index === 0 ? 0 : 1
        if (part.kind === 'quote') {
          const { quote } = part
          const quoteNo = parts.slice(0, index).filter(earlier => earlier.kind === 'quote').length + 1
          const which = quoteCount === 1 ? 'quote' : `quote ${quoteNo}`
          const lineCount = quote.text.split('\n').length
          // Plain text only, unlike a table's copy: Slack would read HTML as rich content.
          const copy = async () => {
            const copied = await $.ui.copy({ text: quote.text, surface: 'terminal' })
            const lines = `(${lineCount} ${lineCount === 1 ? 'line' : 'lines'})`
            $.ui.toast(copied.isCopied ? `Copied ${which} ${lines}` : `Could not copy ${which}: ${copied.reason}`)
          }
          return (
            <Box flexDirection="column" marginTop={marginTop} marginBottom={1}>
              <Markdown text={quote.markdown} />
              {links(`quote-buttons:${quoteNo}`, link(`quote:${quoteNo}`, 'copy text', copy))}
            </Box>
          )
        }
        if (part.kind === 'table') {
          const { table } = part
          const tableNo = parts.slice(0, index).filter(earlier => earlier.kind === 'table').length + 1
          const which = tableCount === 1 ? 'table' : `table ${tableNo}`
          const rows = `(${table.rows.length} rows)`

          const copyPlain = async (text: string, as: string) => {
            const copied = await $.ui.copy({ text, surface: 'terminal' })
            $.ui.toast(copied.isCopied ? `Copied ${which} as ${as} ${rows}` : `Could not copy ${which}: ${copied.reason}`)
          }
          // $.ui.copy holds plain text only. The X11 script offers HTML and the cells at once, so
          // Teams and spreadsheets get a table and plain-text apps still paste the cells. Without
          // X11 (Wayland only, macOS, no python3), the cells alone.
          const copyRich = async () => {
            const tsv = toTsv(table)
            const { exitCode } = await $.process
              .run(['python3', '-I', '-c', X11_CLIPBOARD_PY], { stdin: JSON.stringify({ text: tsv, html: toHtml(table) }), timeoutMs: 5000 })
              .catch(() => ({ exitCode: -1 }))
            if (exitCode === 0) $.ui.toast(`Copied ${which} ${rows}`)
            else await copyPlain(tsv, 'tab-separated cells (a formatted copy needs an X11 desktop)')
          }
          return (
            <Box flexDirection="column" marginTop={marginTop} marginBottom={1}>
              <Markdown text={table.markdown} />
              {links(
                `buttons:${tableNo}`,
                link(`md:${tableNo}`, 'copy as markdown', () => copyPlain(table.markdown, 'markdown')),
                link(`rich:${tableNo}`, 'copy table', copyRich),
              )}
            </Box>
          )
        }

        const withSource = (note: string, ...items: ReturnType<typeof link>[]) => (
          <Box flexDirection="column" marginTop={marginTop} marginBottom={1}>
            <Markdown text={part.fence} />
            {note ? <Text dimColor>{note}</Text> : null}
            {items.length ? links(`links-${index}`, ...items) : null}
          </Box>
        )
        const id = await diagramId(part.source)
        const diagramRef = { plugin: 'toolkit', key: 'mermaidDiagram', id } as const
        const sourceRef = { plugin: 'toolkit', key: 'mermaidIsSource', id: `${e.requestId}:${index}` } as const

        // Draws the diagram, and a flowchart turned the other way too, in both themes, then stores
        // the outcome. Pictures already on disk are reused.
        const schedule = () => {
          if (started.has(id)) return
          started.add(id)
          $.clock.after(0, () => {
            queue = queue.then(async () => {
              const { source, turned } = orientations(part.source)
              const jobs = [{ name: id, source }, ...(turned === undefined ? [] : [{ name: `${id}-turned`, source: turned }])]
              const saved = async (name: string) =>
                (await $.fs.exists(`${dir}/${name}.json`)) ? pairOf(dir, name, await $.fs.read(`${dir}/${name}.json`)) : undefined
              const draw = async (): Promise<Diagram> => {
                if ((await Promise.all(jobs.map(job => saved(job.name)))).some(pair => !pair)) {
                  const installed = await Promise.all(rendererFiles(dir).map(file => $.fs.exists(file)))
                  if (installed.includes(false)) {
                    const install = await $.process.run(installArgv(dir), { cwd: dir, timeoutMs: INSTALL_TIMEOUT_MS })
                    if (install.exitCode !== 0) return { status: 'failed', reason: reasonOf(install.stderr, 'npm', install.exitCode) }
                  }
                  for (const job of jobs) await $.fs.write(`${dir}/${job.name}.mmd`, job.source)
                  const run = await $.process.run(renderArgv(dir, jobs.map(job => job.name)), { cwd: dir, timeoutMs: RENDER_TIMEOUT_MS })
                  // The turned chart is drawn second, so a run that fails on it still leaves the first.
                  if (!(await saved(id))) return { status: 'failed', reason: reasonOf(run.stderr, 'node', run.exitCode) }
                }
                const [written, other] = await Promise.all(jobs.map(job => saved(job.name)))
                if (!written) return { status: 'failed', reason: 'the renderer wrote no picture' }
                return { status: 'drawn', ...written, ...(other ? { turned: other } : {}) }
              }
              const outcome = await draw().catch((err: unknown): Diagram => ({ status: 'failed', reason: String(err) }))
              await $.state.set(diagramRef, outcome)
            })
          })
        }

        const diagram = await read($, diagramRef)
        if (!diagram) {
          schedule()
          const installed = await Promise.all(rendererFiles(dir).map(file => $.fs.exists(file)))
          return withSource(installed.includes(false) ? 'installing the diagram renderer, once (about 16 MB, can take a few minutes)…' : 'drawing diagram…')
        }
        if (diagram.status === 'failed') {
          const retry = () => {
            started.delete(id)
            schedule()
          }
          return withSource(`mermaid: ${diagram.reason}`, link(`retry-${index}`, 'Retry', retry))
        }
        const toggle = (label: string) => link(`toggle-${index}`, label, () => update($, sourceRef, was => !was))
        if (await read($, sourceRef)) return withSource('', toggle('Show picture'))

        const theme = (await read($, { plugin: 'toolkit', key: 'mermaidTheme' } as const)) ?? 'dark'
        const { pair, fit } = pick(diagram, viewport)
        const picture = pair[theme]
        const openFull = async () => {
          const opener = (await read($, { plugin: 'toolkit', key: 'mermaidOpener' } as const)) ?? 'xdg-open'
          const run = await $.process.run([opener, picture.full],{ timeoutMs: 10_000 }).catch((err: unknown) => ({ exitCode: -1, stderr: String(err) }))
          if (run.exitCode !== 0) $.ui.toast(`Could not open the diagram: ${reasonOf(run.stderr, opener, run.exitCode)}`)
        }
        return (
          <Box flexDirection="column" marginTop={marginTop} marginBottom={1}>
            <Box marginLeft={2}>
              <Image source={{ file: picture.file, format: 'png' }} columns={fit.columns} rows={fit.rows} alt={part.fence} />
            </Box>
            {isShrunk(fit)
              ? links(`links-${index}`, toggle('Show source'), link(`full-${index}`, 'open full size', openFull))
              : links(`links-${index}`, toggle('Show source'))}
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
