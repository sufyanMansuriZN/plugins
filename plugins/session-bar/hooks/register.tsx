import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentModels, Ctx, Limits, Weekly } from '../types'

// Calm segments are plain text in the terminal's own colors, so they read on any theme (it can be `auto`,
// which a mod cannot resolve). Only a segment that needs attention becomes a pill: orange, or vermillion when
// hot (Okabe-Ito), with dark text that reads on both. Color, and the pill shape, always mean "look here".
const ATTN = { warn: '#E69F00', hot: '#D55E00' } as const
const ON_ATTN = '#191919'

const limits = atom({ plugin: 'session-bar', key: 'limits' } as const, [] as Limits)
const weekly = atom({ plugin: 'session-bar', key: 'weekly' } as const, [] as Weekly)
const fetchedAt = atom({ plugin: 'session-bar', key: 'fetchedAt' } as const, 0)
const ctx = atom({ plugin: 'session-bar', key: 'ctx' } as const, undefined as Ctx | undefined)
const agentModels = atom({ plugin: 'session-bar', key: 'agentModels' } as const, {} as AgentModels)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0) // bumped each minute so countdowns move while idle

// a subagent's model into the map; the same map when main's step or a repeat leaves it as it was
export const withModel = (ms: AgentModels, agentId: string | undefined, model: string): AgentModels =>
  !agentId || ms[agentId] === model ? ms : { ...ms, [agentId]: model }

export type Level = keyof typeof ATTN | undefined

// raw share used: windows with no reset time to pace against
export const band = (pct: number): Level => pct >= 80 ? 'hot' : pct >= 50 ? 'warn' : undefined

// Context by tokens sent, not window share: quality, latency and cost track tokens. Warn at 150K, the API's
// default compaction trigger; hot at 250K, past which long-context scores drop, capped at 80% of the window so a
// 200K window (a 200K model, or an auto-compact window the engine may report instead) still turns hot before it
// compacts. Warn is never capped: with a ~60K baseline, half of a 200K window would fire after a few reads.
// Sources: openspec/changes/session-bar-visual-redesign/research-context-size.md
export const CTX_WARN = 150_000
export const ctxHot = ({ window }: Ctx) => Math.min(250_000, window * 0.8)
export const ctxBand = (c: Ctx): Level =>
  c.tokens >= ctxHot(c) ? 'hot' : c.tokens >= CTX_WARN ? 'warn' : undefined

// 187400 -> 187K, 1000000 -> 1M
export const tokensText = (n: number) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`

// usage against the share of the window gone: 61% on day 6 is calm, 71% an hour and a half into 5h is not
export const paceBand = (pct: number, elapsed: number): Level => {
  const ahead = pct - elapsed * 100
  return ahead > 30 || pct >= 90 ? 'hot' : ahead > 15 ? 'warn' : undefined
}

const HOUR = 3_600_000
export const WEEK = 168 * HOUR
export const WINDOW_MS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: WEEK }

export const elapsed = (resetsAt: string, windowMs: number, now: number) =>
  Math.min(1, Math.max(0, 1 - (Date.parse(resetsAt) - now) / windowMs))

// at most two units: 1d7h, 2h40m, 12m
export const countdown = (ms: number) => {
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  return d ? `${d}d${h % 24 ? `${h % 24}h` : ''}`
    : h ? `${h}h${m % 60 ? `${m % 60}m` : ''}`
    : m ? `${m}m` : '<1m'
}

// 10 cells (one per 10%) or 5, at half-cell steps: heavy ━ used, light ─ left, ╾ the half between them.
// The two parts differ in weight, not only color, so the bar reads on any theme and inside an attention pill.
// `tick` (a share of the scale, 0-1) swaps its cell for a cross keeping that cell's line weight: ┿ on used,
// ┽ on the half, ┼ on what's left. It then takes the look of the part it lands in
export const bar = (pct: number, cells = 10, tick?: number) => {
  const halves = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells * 2)
  const used = '━'.repeat(halves >> 1) + (halves % 2 ? '╾' : '')
  let line = used + '─'.repeat(cells - used.length)
  if (tick !== undefined) {
    const at = Math.min(cells - 1, Math.floor(tick * cells))
    const mark = at < halves >> 1 ? '┿' : at < used.length ? '┽' : '┼'
    line = line.slice(0, at) + mark + line.slice(at + 1)
  }
  return { used: line.slice(0, used.length), rest: line.slice(used.length) }
}

// robbyrussell style: trailing path component, or ~ at $HOME
export const shortDir = (root: string, home?: string) =>
  root === home ? '~' : root.split('/').filter(Boolean).pop() ?? '/'

// $.session.model() answers the id; the status line showed the label. No API gives the label, so derive it:
// claude-opus-5-5[1m] -> Opus 5.5 1M, claude-haiku-4-5-20251001 -> Haiku 4.5; anything else as given.
// The window, once a reading names it, follows the name: the id carries [1m] only sometimes, and ctx no longer shows it
export const modelLabel = (id: string, window?: number) => {
  const size = window ? ` ${tokensText(window)}` : ''
  const m = /^claude-([a-z]+)((?:-\d{1,2})+)(?:-\d{8})?(\[1m\])?$/i.exec(id)
  if (!m) return id + size
  const [, name, ver, big] = m as unknown as [string, string, string, string?]
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${ver.slice(1).replaceAll('-', '.')}${size || (big ? ' 1M' : '')}`
}

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }

export const limitText = (l: Limits[number]) => LIMIT_LABELS[l.kind] ?? l.kind

// session.usage() has 5h/7d only once a response lands; the usage endpoint answers them at launch,
// named session/weekly_all (mapped to session.usage()'s kinds), plus per-model weekly windows (Fable)
const ENDPOINT_KINDS: Record<string, string> = { session: 'five_hour', weekly_all: 'seven_day' }

export const parseUsage = (text: string): { limits: Limits; weekly: Weekly } => {
  const ls: any[] = JSON.parse(text).limits ?? []
  return {
    limits: ls.filter(l => ENDPOINT_KINDS[l.kind])
      .map(l => ({ kind: ENDPOINT_KINDS[l.kind]!, percentUsed: l.percent, resetsAt: l.resets_at ?? undefined })),
    weekly: ls.filter(l => l.kind === 'weekly_scoped' && l.scope?.model?.display_name != null)
      .map(l => ({ percent: l.percent, name: l.scope.model.display_name, resetsAt: l.resets_at ?? undefined })),
  }
}

// a reading whose window has reset says nothing about the new one
export const fresh = <T extends { resetsAt?: string }>(ls: T[], now: number) =>
  ls.filter(l => !l.resetsAt || Date.parse(l.resetsAt) > now)

export type Run = { text: string; color?: string; backgroundColor?: string; dimColor?: boolean; bold?: boolean }
export type Win = { label: string; pct: number; resetsAt?: string; windowMs?: number }
// agent: the type of the subagent whose transcript is in view; absent on main
export type BarInput = { dir: string; agent?: string; model?: string; ctx?: Ctx; windows: Win[]; now: number }
// 0 full, 1 5h countdown only, 2 short bars, 3 no bars, 4 no countdowns
export type Tier = 0 | 1 | 2 | 3 | 4

const pace = (w: Win, now: number): Level =>
  w.resetsAt && w.windowMs ? paceBand(w.pct, elapsed(w.resetsAt, w.windowMs, now)) : band(w.pct)

// a calm segment as is; one needing attention wrapped in a rounded pill, every run on its fill
const segment = (level: Level, runs: Run[]): Run[] => {
  if (!level) return runs
  const bg = ATTN[level]
  const on = ({ text }: Run): Run => ({ text, color: ON_ATTN, backgroundColor: bg })
  return [{ text: '', color: bg }, ...[{ text: ' ' }, ...runs, { text: ' ' }].map(on), { text: '', color: bg }]
}

export const segments = (b: BarInput, tier: Tier): Run[] => {
  const dim = (text: string): Run => ({ text, dimColor: true })
  const meter = (label: string, pct: number, level: Level, value = `${Math.round(pct)}%`, after?: string, tick?: number) => {
    const { used, rest } = bar(pct, tier < 2 ? 10 : 5, tick)
    return segment(level, [
      dim(`${label} `),
      ...(tier < 3 ? [{ text: used }, dim(rest), { text: ' ' }] : []),
      { text: value },
      ...(after ? [dim(` ${after}`)] : []),
    ])
  }

  const groups: Run[][] = [[
    { text: b.dir, bold: true }, ...[b.agent, b.model].filter(Boolean).map(t => dim(` · ${t}`)),
  ]]
  if (b.ctx) {
    // the bar runs to the hot threshold, so bar and color share one scale: full means hot, the tick marks warn
    const hot = ctxHot(b.ctx)
    groups.push(meter('ctx', (b.ctx.tokens / hot) * 100, ctxBand(b.ctx), tokensText(b.ctx.tokens), undefined, CTX_WARN / hot))
  }
  for (const w of b.windows) {
    // the 5h reset is the one watched, so it stays until the last tier; weekly ones only show at full width
    const left = w.resetsAt ? Date.parse(w.resetsAt) - b.now : 0
    const shown = tier === 0 || (tier < 4 && w.windowMs === WINDOW_MS.five_hour)
    groups.push(meter(w.label, w.pct, pace(w, b.now), undefined, shown && left > 0 ? countdown(left) : undefined))
  }
  return groups.flatMap((g, i) => i ? [{ text: '   ' }, ...g] : g)
}

export const width = (runs: Run[]) => runs.reduce((n, r) => n + [...r.text].length, 0)

// the richest tier that fits one row
export const layout = (b: BarInput, columns = Infinity): Run[] => {
  for (const tier of [0, 1, 2, 3] as const) {
    const runs = segments(b, tier)
    if (width(runs) <= columns) return runs
  }
  return segments(b, 4)
}

const refreshUsage = async ($: EngineInterface, force = false) => {
  try {
    const now = await $.clock.now()
    if (!force && now - (await read($, fetchedAt)) < 300_000) return
    await update($, fetchedAt, () => now)
    await $.store.set('fetchedAt', now) // claim the window so overlapping refreshes don't all fetch
    const auth = (await $.session.authorize())?.handle
    if (!auth) return
    const r = await $.http.fetch('https://api.anthropic.com/api/oauth/usage', {
      auth, headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
    if (!r.ok) return
    const u = parseUsage(r.text)
    if (u.limits.length) {
      await update($, limits, () => u.limits)
      await $.store.set('limits', u.limits)
    }
    if (u.weekly.length) {
      await update($, weekly, () => u.weekly)
      await $.store.set('weekly', u.weekly)
    }
  } catch {} // keep the last good rows
}

export const register: Register = on => {
  // drawing is pure, so usage is fetched at launch rather than on first render
  on('session.start', async ($, e, next) => {
    // $.state is per session; $.store outlives it: the last known values stand in until the fetch lands,
    // or for good when it fails (offline, logged out)
    const [ls, ws, now] = await Promise.all([$.store.get('limits'), $.store.get('weekly'), $.clock.now()])
    if (ls) await update($, limits, () => fresh(ls as Limits, now))
    if (ws) await update($, weekly, () => fresh(ws as Weekly, now))
    void refreshUsage($, true)
    // a reload drops this module's timers, so no cancel is kept
    $.clock.every(60_000, () => void update($, tick, n => n + 1))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refreshUsage($)
    return result
  })

  // $.agent.list() names no model, so a subagent's is kept from its requests, a fallback's included
  on('turn.step', async function* ($, e, next) {
    // update() always writes, so look first: most steps repeat the model the agent already has
    if (e.agentId && (await read($, agentModels))[e.agentId] !== e.model) {
      await update($, agentModels, ms => withModel(ms, e.agentId, e.model))
    }
    return yield* next(e)
  })

  // an early reading, so the model shows before the subagent's first request; its steps stay the source
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (!r.deny && r.agentId) await update($, agentModels, ms => withModel(ms, r.agentId, r.model))
    return r
  })

  // pushed after each turn and whenever a window moves a point, so the band redraws live
  on('session.measure', async ($, e, next) => {
    // absent until a request lands: keep the last seen reading so 5h/7d don't blink out
    if (e.rateLimits.length) {
      await update($, limits, () => e.rateLimits)
      await $.store.set('limits', e.rateLimits)
    }
    const { tokens, window } = e.context
    if (tokens !== undefined && window) await update($, ctx, () => ({ tokens, window }))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [root, home, model, c, ls, ws, now] = await Promise.all([
      $.session.root(), $.env.get('HOME'), $.session.model(), read($, ctx), read($, limits), read($, weekly),
      $.clock.now(), read($, tick),
    ])
    const windows: Win[] = [
      ...fresh(ls, now).map(l => ({ label: limitText(l), pct: l.percentUsed, resetsAt: l.resetsAt, windowMs: WINDOW_MS[l.kind] })),
      ...fresh(ws, now).map(w => ({ label: w.name, pct: w.percent, resetsAt: w.resetsAt, windowMs: WEEK })),
    ]
    // a subagent's transcript in view: its type and model; main's ctx and window say nothing about it
    const agentId = e.props.view?.agentId
    let shown: Pick<BarInput, 'agent' | 'model' | 'ctx'> = { model: model ? modelLabel(model, c?.window) : undefined, ctx: c }
    if (agentId) {
      const [ms, agents] = await Promise.all([read($, agentModels), $.agent.list()])
      const a = agents.find(a => a.id === agentId), m = ms[agentId]
      shown = { agent: a?.type ?? a?.name, model: m ? modelLabel(m) : undefined }
    }
    const runs = layout({ dir: shortDir(root, home), ...shown, windows, now }, e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box>{runs.map(({ text, ...style }) => <Text {...style}>{text}</Text>)}</Box>
        {below}
      </Box>
    )
  })
}
