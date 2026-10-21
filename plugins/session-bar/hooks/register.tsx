import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { AgentReading, Git } from '../types'
import { type BarInput, type Run, SEP, modelLabel, parseContext, parseGit, parseWindowSize, parseWindows, segments, stepTokens } from './bar'

const agents = atom({ plugin: 'session-bar', key: 'agents' } as const, {} as Record<string, AgentReading>)
const git = atom({ plugin: 'session-bar', key: 'git' } as const, null as Git | null)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0)

// Okabe-Ito colors, told apart with the common color vision deficiencies; orange and vermillion
// also differ in lightness. Fixed, not theme keys, so black on each keeps 5:1 in light and dark themes.
const BADGE: Record<Extract<Run, { badge: true }>['tone'], string> = {
  yellow: '#E69F00',
  red: '#D55E00',
  blue: '#56B4E9',
}

// Nerd Font "refresh" (U+F021), centered in its cell where ↻ sits off center; Ghostty bundles the
// Nerd Font symbols. The desktop app draws with its own fonts, so it keeps ↻.
export const RESET_TERMINAL = ' '

const props = (r: Run) =>
  r.badge ? { backgroundColor: BADGE[r.tone], color: '#000000', bold: true } : r.tone === 'dim' ? { dimColor: true } : {}

const refreshGit = async ($: EngineInterface) => {
  let next: Git | null = null
  try {
    const r = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 2000 })
    if (r.exitCode === 0) next = parseGit(r.stdout)
  } catch {} // git missing or too slow: no git segment
  if (JSON.stringify(await read($, git)) !== JSON.stringify(next)) await update($, git, () => next)
}

// update() always writes, and a write redraws the band, so most steps (same model, same tokens) write nothing
const record = async ($: EngineInterface, id: string, change: (was: AgentReading | undefined) => AgentReading) => {
  const was = (await read($, agents))[id]
  const reading = change(was)
  if (was?.model === reading.model && was.tokens === reading.tokens) return
  await update($, agents, all => ({ ...all, [id]: reading }))
}

const mainView = async ($: EngineInterface, usage: SessionUsage): Promise<Pick<BarInput, 'agent' | 'model' | 'ctx'>> => {
  const id = await $.session.model()
  return { agent: null, model: id ? modelLabel(id, parseWindowSize(usage.context)) : null, ctx: parseContext(usage.context) }
}

// the main loop's model and context say nothing about a subagent, so before its first step both are left out
const agentView = async ($: EngineInterface, agentId: string): Promise<Pick<BarInput, 'agent' | 'model' | 'ctx'>> => {
  const [all, list] = await Promise.all([read($, agents), $.agent.list()])
  const info = list.find(a => a.id === agentId)
  const reading = all[agentId]
  return {
    agent: info?.type || info?.name || null,
    model: reading ? modelLabel(reading.model) : null,
    ctx: reading && reading.tokens !== null ? { kind: 'tokens', tokens: reading.tokens } : null,
  }
}

// a module variable on purpose: a reload drops the timer with it, and the next hook starts it again
let isTicking = false

const startTicking = ($: EngineInterface) => {
  if (isTicking) return
  isTicking = true
  $.clock.every(30_000, () => {
    void update($, tick, n => n + 1)
    void refreshGit($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    startTicking($)
    void refreshGit($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    startTicking($)
    void refreshGit($)
    return done
  })

  // a render reading $.session.usage() is not subscribed to it; the tick redraws the band with the new figures
  on('session.measure', async ($, e, next) => {
    await update($, tick, n => n + 1)
    return next(e)
  })

  // $.agent.list() names no model, so each subagent's is kept from its own requests
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (!id) return yield* next(e)
    await record($, id, was => ({ model: e.model, tokens: was?.tokens ?? null }))
    const result = yield* next(e)
    const usage = result?.usage
    if (usage) await record($, id, was => ({ model: usage.model, tokens: stepTokens(usage) ?? was?.tokens ?? null }))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [g, now, usage] = await Promise.all([read($, git), $.clock.now(), $.session.usage(), read($, tick)])
    const agentId = e.props.view?.agentId
    const shown = agentId ? await agentView($, agentId) : await mainView($, usage)
    const resetMark = e.surface === 'terminal' ? RESET_TERMINAL : '↻'
    const row = segments({ git: g, ...shown, windows: parseWindows(usage.rateLimits), now, resetMark }, e.props.bodyColumns)
    const runs = row.flatMap((seg, i): Run[] => (i ? [{ text: SEP, tone: 'dim' }, ...seg] : seg))
    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box>{runs.map(r => <Text {...props(r)}>{r.text}</Text>)}</Box>
        {below}
      </Box>
    )
  })
}
