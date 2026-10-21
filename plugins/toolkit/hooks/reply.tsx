import { read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

import type { Diagram, Picture } from '../types'
import { blocks } from './blocks'
import { cellsOf, diagramId, isTooWide, MMDC_TIMEOUT_MS, mmdcArgv, pick, pngSize, reasonOf, upright } from './mermaid'

// The one hook that draws a reply. Each tool that draws part of a reply would otherwise take over
// the whole reply, and a second such hook would draw over the first.
export const register: Register = (on, options) => {
  // The diagrams this load of the module has asked mmdc for, and the one mmdc run at a time.
  const started = new Set<string>()
  let queue: Promise<unknown> = Promise.resolve()

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
    const wantsMermaid = options.mermaid !== false && e.props.text.includes('```mermaid')
    // Empty until session start finds a terminal that draws pictures; till then fences stay text.
    const dir = (wantsMermaid ? await read($, { plugin: 'toolkit', key: 'mermaidDir' } as const) : undefined) ?? ''
    const parts = blocks(e.props.text, { mermaid: dir !== '' })
    if (parts.every(part => part.kind === 'text')) return next(e)

    const { Box, Button, Image, Markdown, Text } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 80

    const drawn = await Promise.all(
      parts.map(async (part, index) => {
        if (part.kind === 'text') return <Markdown text={part.text} />
        const id = await diagramId(part.source)
        const diagramRef = { plugin: 'toolkit', key: 'mermaidDiagram', id } as const
        const sourceRef = { plugin: 'toolkit', key: 'mermaidIsSource', id: `${e.requestId}:${index}` } as const

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
                const run = await $.process.run(mmdcArgv(dir, name), { cwd: dir, timeoutMs: MMDC_TIMEOUT_MS })
                if (run.exitCode !== 0) return reasonOf(run.stderr, run.exitCode)
                // Renamed into place whole, so a run cut short never leaves a picture to reuse.
                await $.process.run(['mv', '-f', `${dir}/${name}.part.png`, png], { cwd: dir })
                const size = pngSize((await $.fs.read(png, { as: 'bytes' })).base64)
                return size ? { file: png, ...size } : 'mmdc wrote no picture'
              }
              let outcome: Diagram
              try {
                const picture = await draw(id, part.source)
                const turnedSource = typeof picture === 'string' || !isTooWide(picture, columns) ? undefined : upright(part.source)
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
