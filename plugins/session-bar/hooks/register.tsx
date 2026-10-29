import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { AgentReading } from '../types'
import { type BarInput, type Run, type Segment, BADGE, GAP, SEP, modelLabel, parseContext, parseWindowSize, segments, stepTokens } from './bar'
import { REFRESH_EVERY, fetchLimits, sharedPath } from './usage'

const agents = atom({ plugin: 'session-bar', key: 'agents' } as const, {} as Record<string, AgentReading>)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0)

// the Desktop app shows the repo, model, context and usage itself, so there the bar does nothing
let isDesktop: boolean | undefined
const inDesktop = async ($: EngineInterface) => (isDesktop ??= (await $.env.get('CLAUDE_CODE_ENTRYPOINT')) === 'claude-desktop')

// one fetch at a time; a second caller shares the first one's answer
let inFlight: Promise<void> | null = null

// The status line script draws the usage windows but has no credential, so the reading goes to a file it reads.
// A failed fetch writes nothing, and the script drops a reading once it is stale.
const shareLimits = async ($: EngineInterface) => {
  const next = await fetchLimits($)
  const path = sharedPath(await $.env.get('XDG_CACHE_HOME'), await $.env.get('HOME'))
  if (!next || !path) return
  await $.fs.write(path, JSON.stringify({ at: await $.clock.now(), limits: next })).catch(() => {})
}

const refreshLimits = ($: EngineInterface): Promise<void> => {
  inFlight ??= shareLimits($).finally(() => {
    inFlight = null
  })
  return inFlight
}

// a module variable on purpose: a reload drops the timer with it, and the next hook starts it again
let isRefreshing = false

const startRefreshing = ($: EngineInterface) => {
  if (isRefreshing) return
  isRefreshing = true
  $.clock.every(REFRESH_EVERY, () => void refreshLimits($))
}

const props = (r: Run) =>
  r.badge ? { backgroundColor: BADGE[r.tone], color: '#000000', bold: true }
  : r.tone === 'dim' ? { dimColor: true } : {}

// update() always writes, and a write redraws the band, so most steps (same model, same tokens) write nothing
const record = async ($: EngineInterface, id: string, change: (was: AgentReading | undefined) => AgentReading) => {
  const was = (await read($, agents))[id]
  const reading = change(was)
  if (was?.model === reading.model && was.tokens === reading.tokens) return
  await update($, agents, all => ({ ...all, [id]: reading }))
}

type View = Pick<BarInput, 'agent' | 'model' | 'ctx'>

const mainView = async ($: EngineInterface, usage: SessionUsage): Promise<View> => {
  const id = await $.session.model()
  return { agent: null, model: id ? modelLabel(id, parseWindowSize(usage.context)) : null, ctx: parseContext(usage.context) }
}

// the main loop's model and context say nothing about a subagent, so before its first step both are left out
const agentView = async ($: EngineInterface, agentId: string): Promise<View> => {
  const [all, list] = await Promise.all([read($, agents), $.agent.list()])
  const info = list.find(a => a.id === agentId)
  const reading = all[agentId]
  return {
    agent: info?.type || info?.name || null,
    model: reading ? modelLabel(reading.model) : null,
    ctx: reading && reading.tokens !== null ? { kind: 'tokens', tokens: reading.tokens } : null,
  }
}

// The band draws only what follows the transcript in view: the agent, the model and the context.
// The status line script draws the rest, which is the same in every view.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (await inDesktop($)) return next(e)
    const started = await next(e)
    startRefreshing($)
    void refreshLimits($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    if (await inDesktop($)) return next(e)
    const done = await next(e)
    startRefreshing($)
    void refreshLimits($)
    return done
  })

  // a render reading $.session.usage() is not subscribed to it; the tick redraws the band with the new figures
  on('session.measure', async ($, e, next) => {
    if (await inDesktop($)) return next(e)
    await update($, tick, n => n + 1)
    return next(e)
  })

  // $.agent.list() names no model, so each subagent's is kept from its own requests
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (!id || (await inDesktop($))) return yield* next(e)
    await record($, id, was => ({ model: e.model, tokens: was?.tokens ?? null }))
    const result = yield* next(e)
    const usage = result?.usage
    if (usage) await record($, id, was => ({ model: usage.model, tokens: stepTokens(usage) ?? was?.tokens ?? null }))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await inDesktop($))) return next(e)
    const [now, usage] = await Promise.all([$.clock.now(), $.session.usage(), read($, tick)])
    const agentId = e.props.view?.agentId
    const shown = agentId ? await agentView($, agentId) : await mainView($, usage)
    const { left, right } = segments({ where: null, git: null, windows: [], now, ...shown }, e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)
    const zone = (segs: Segment[]) => segs
      .flatMap((seg, i): Run[] => (i ? [{ text: SEP, tone: 'dim' }, ...seg] : seg))
      .map(r => <Text {...props(r)}>{r.text}</Text>)
    const below = await next(e)

    // the bar is the band's last row, on the prompt, whatever order other hooks drawing here run in;
    // the left zone takes the free room, so the right zone sits at the band's right edge
    return (
      <Box flexDirection="column">
        {below}
        <Box>
          <Box key="left" flexGrow={1}>{zone(left)}</Box>
          {right.length ? <Box key="right" marginLeft={GAP}>{zone(right)}</Box> : null}
        </Box>
      </Box>
    )
  })
}
