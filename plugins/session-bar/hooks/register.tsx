import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ctx, Limits, Weekly } from '../types'

// Calm segments are plain text in the terminal's own colors, so they read on any theme (it can be `auto`,
// which a mod cannot resolve). Only a segment that needs attention becomes a pill: orange, or vermillion when
// hot (Okabe-Ito), with dark text that reads on both. Color, and the pill shape, always mean "look here".
const ATTN = { warn: '#E69F00', hot: '#D55E00' } as const
const ON_ATTN = '#191919'

const limits = atom({ plugin: 'session-bar', key: 'limits' } as const, [] as Limits)
const weekly = atom({ plugin: 'session-bar', key: 'weekly' } as const, [] as Weekly)
const fetchedAt = atom({ plugin: 'session-bar', key: 'fetchedAt' } as const, 0)
const ctx = atom({ plugin: 'session-bar', key: 'ctx' } as const, undefined as Ctx | undefined)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0) // bumped each minute so countdowns move while idle
const cache = atom({ plugin: 'session-bar', key: 'cache' } as const, [] as number[])

export type Level = keyof typeof ATTN | undefined

// raw share used: windows with no reset time to pace against
export const band = (pct: number): Level => pct >= 80 ? 'hot' : pct >= 50 ? 'warn' : undefined

// Context by tokens sent, not window share: quality, latency and cost track tokens. Warn at 150K, the API's
// default compaction trigger; hot at 250K, past which long-context scores drop, capped at 80% of the window so a
// 200K window (a 200K model, or an auto-compact window the engine may report instead) still turns hot before it
// compacts. Warn is never capped: with a ~60K baseline, half of a 200K window would fire after a few reads.
// Sources: openspec/changes/session-bar-visual-redesign/research-context-size.md
export const ctxBand = ({ tokens, window }: Ctx): Level =>
  tokens >= Math.min(250_000, window * 0.8) ? 'hot' : tokens >= 150_000 ? 'warn' : undefined

// 187400 -> 187K, 1000000 -> 1M
export const tokensText = (n: number) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`

// usage against the share of the window gone: 61% on day 6 is calm, 71% an hour and a half into 5h is not
export const paceBand = (pct: number, elapsed: number): Level => {
  const ahead = pct - elapsed * 100
  return ahead > 30 || pct >= 90 ? 'hot' : ahead > 15 ? 'warn' : undefined
}

// share of the last response's input served from the prompt cache, 0-100
export const cacheRatio = (u: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }) => {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return total ? (u.cache_read_input_tokens / total) * 100 : undefined
}

// one miss is expected (fresh start, /compact, an idle gap past the cache's life); two in a row is a cache going cold
export const cacheBand = (ratios: number[]): Level =>
  ratios.length >= 2 && ratios.slice(-2).every(r => r < 50) ? 'warn' : undefined

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
// The two parts differ in weight, not only color, so the bar reads on any theme and inside an attention pill
export const bar = (pct: number, cells = 10) => {
  const halves = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells * 2)
  const used = '━'.repeat(halves >> 1) + (halves % 2 ? '╾' : '')
  return { used, rest: '─'.repeat(cells - used.length) }
}

// robbyrussell style: trailing path component, or ~ at $HOME
export const shortDir = (root: string, home?: string) =>
  root === home ? '~' : root.split('/').filter(Boolean).pop() ?? '/'

// $.session.model() answers the id; the status line showed the label. No API gives the label, so derive it:
// claude-opus-5-5[1m] -> Opus 5.5 1M, claude-haiku-4-5-20251001 -> Haiku 4.5; anything else as given
export const modelLabel = (id: string) => {
  const m = /^claude-([a-z]+)((?:-\d{1,2})+)(?:-\d{8})?(\[1m\])?$/i.exec(id)
  if (!m) return id
  const [, name, ver, big] = m as unknown as [string, string, string, string?]
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${ver.slice(1).replaceAll('-', '.')}${big ? ' 1M' : ''}`
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
export type BarInput = { dir: string; model?: string; ctx?: Ctx; windows: Win[]; now: number; cache?: number[] }
// 0 full, 1 no countdowns, 2 short bars, 3 no bars
export type Tier = 0 | 1 | 2 | 3

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
  const meter = (label: string, pct: number, level: Level, value = `${Math.round(pct)}%`, after?: string) => {
    const { used, rest } = bar(pct, tier < 2 ? 10 : 5)
    return segment(level, [
      dim(`${label} `),
      ...(tier < 3 ? [{ text: used }, dim(rest), { text: ' ' }] : []),
      { text: value },
      ...(after ? [dim(` ${after}`)] : []),
    ])
  }

  const groups: Run[][] = [[{ text: b.dir, bold: true }, ...(b.model ? [dim(` · ${b.model}`)] : [])]]
  if (b.ctx) {
    // the bar shows the window's share; the tokens beside it explain the color
    const { tokens, window } = b.ctx
    groups.push(meter('ctx', (tokens / window) * 100, ctxBand(b.ctx), `${tokensText(tokens)}/${tokensText(window)}`))
  }
  for (const w of b.windows) {
    const left = w.resetsAt ? Date.parse(w.resetsAt) - b.now : 0
    groups.push(meter(w.label, w.pct, pace(w, b.now), undefined, tier === 0 && left > 0 ? countdown(left) : undefined))
  }
  const last = b.cache?.at(-1)
  if (last !== undefined) groups.push(segment(cacheBand(b.cache!), [dim('cache '), { text: `${Math.round(last)}%` }]))
  return groups.flatMap((g, i) => i ? [{ text: '   ' }, ...g] : g)
}

export const width = (runs: Run[]) => runs.reduce((n, r) => n + [...r.text].length, 0)

// the richest tier that fits one row
export const layout = (b: BarInput, columns = Infinity): Run[] => {
  for (const tier of [0, 1, 2] as const) {
    const runs = segments(b, tier)
    if (width(runs) <= columns) return runs
  }
  return segments(b, 3)
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

  // pushed after each turn and whenever a window moves a point, so the band redraws live
  on('session.measure', async ($, e, next) => {
    // absent until a request lands: keep the last seen reading so 5h/7d don't blink out
    if (e.rateLimits.length) {
      await update($, limits, () => e.rateLimits)
      await $.store.set('limits', e.rateLimits)
    }
    const { tokens, window } = e.context
    if (tokens !== undefined && window) await update($, ctx, () => ({ tokens, window }))
    const result = await next(e)
    // the token split rides on the breakdown; 'summary' estimates locally and sends no request
    if (e.changed.includes('context')) {
      try {
        const u = (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.apiUsage
        const r = u ? cacheRatio(u) : undefined
        if (r !== undefined) await update($, cache, rs => [...rs, r].slice(-2))
      } catch {} // no reading: the pill keeps its last one
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [root, home, model, c, ls, ws, now, , ratios] = await Promise.all([
      $.session.root(), $.env.get('HOME'), $.session.model(), read($, ctx), read($, limits), read($, weekly),
      $.clock.now(), read($, tick), read($, cache),
    ])
    const windows: Win[] = [
      ...fresh(ls, now).map(l => ({ label: limitText(l), pct: l.percentUsed, resetsAt: l.resetsAt, windowMs: WINDOW_MS[l.kind] })),
      ...fresh(ws, now).map(w => ({ label: w.name, pct: w.percent, resetsAt: w.resetsAt, windowMs: WEEK })),
    ]
    const runs = layout(
      { dir: shortDir(root, home), model: model ? modelLabel(model) : undefined, ctx: c, windows, now, cache: ratios },
      e.props.bodyColumns,
    )
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
