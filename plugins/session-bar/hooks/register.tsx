import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { AgentReading, Git } from '../types'
import {
  type BarInput, type Ink, type Run, type Segment, GAP, SEP, folderName, modelLabel, parseContext, parseGit, parseWindowSize, parseWindows, segments, stepTokens,
} from './bar'

const agents = atom({ plugin: 'session-bar', key: 'agents' } as const, {} as Record<string, AgentReading>)
const git = atom({ plugin: 'session-bar', key: 'git' } as const, null as Git | null)
const where = atom({ plugin: 'session-bar', key: 'where' } as const, null as string | null)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0)

// Okabe-Ito colors, told apart with the common color vision deficiencies; orange and vermillion
// also differ in lightness. Fixed, not theme keys, so black on each keeps 5:1 in light and dark themes.
const BADGE: Record<Extract<Run, { badge: true }>['tone'], string> = {
  yellow: '#E69F00',
  red: '#D55E00',
  blue: '#56B4E9',
}

// oh-my-zsh robbyrussell's prompt colors, as the terminal's named ANSI colors: its theme sets them for light
// and dark, so they are not fixed colors. A desktop has no such palette and would draw a fixed CSS color
// (cyan on white is near unreadable), so it draws no ink.
const INK: Record<Ink, { color: string; bold?: true }> = {
  where: { color: 'cyan' },
  paren: { color: 'blue', bold: true },
  branch: { color: 'red' },
  changes: { color: 'yellow' },
}

const props = (r: Run, inks: boolean) =>
  r.badge ? { backgroundColor: BADGE[r.tone], color: '#000000', bold: true }
  : inks && r.ink ? INK[r.ink]
  : r.tone === 'dim' ? { dimColor: true } : {}

const refreshRepo = async ($: EngineInterface) => {
  let next: Git | null = null
  try {
    const r = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 2000 })
    if (r.exitCode === 0) next = parseGit(r.stdout)
  } catch {} // git missing or too slow: no git segment
  if (JSON.stringify(await read($, git)) !== JSON.stringify(next)) await update($, git, () => next)
  try {
    // a worktree's repo root is its main working tree, so a worktree shows the repo's own name
    const repo = await $.session.repo()
    const name = folderName(repo ? repo.root : await $.session.cwd())
    if ((await read($, where)) !== name) await update($, where, () => name)
  } catch {} // the name stays as it was
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
    void refreshRepo($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    startTicking($)
    void refreshRepo($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    startTicking($)
    void refreshRepo($)
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
    const [g, w, now, usage] = await Promise.all([read($, git), read($, where), $.clock.now(), $.session.usage(), read($, tick)])
    const agentId = e.props.view?.agentId
    const shown = agentId ? await agentView($, agentId) : await mainView($, usage)
    const { left, right } = segments({ where: w, git: g, ...shown, windows: parseWindows(usage.rateLimits), now }, e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)
    const zone = (segs: Segment[]) => segs
      .flatMap((seg, i): Run[] => (i ? [{ text: SEP, tone: 'dim' }, ...seg] : seg))
      .map(r => <Text {...props(r, e.surface === 'terminal')}>{r.text}</Text>)
    const below = await next(e)

    // the left zone takes the free room, so the right zone sits at the band's right edge
    return (
      <Box flexDirection="column">
        <Box>
          <Box key="left" flexGrow={1}>{zone(left)}</Box>
          {right.length ? <Box key="right" marginLeft={GAP}>{zone(right)}</Box> : null}
        </Box>
        {below}
      </Box>
    )
  })
}
