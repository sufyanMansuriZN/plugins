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
const ctx = atom({ plugin: 'session-bar', key: 'ctx' } as const, undefined as Ctx | undefined)
const agentModels = atom({ plugin: 'session-bar', key: 'agentModels' } as const, {} as AgentModels)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0) // bumped each minute so countdowns move while idle
const noPanes = atom({ plugin: 'session-bar', key: 'noPanes' } as const, false) // set once Desktop answers a pane open with isPlaced false
const PANE = 'usage'

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
export type BarInput = { dir: string; branch?: string; agent?: string; model?: string; ctx?: Ctx; windows: Win[]; now: number }
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
    { text: b.dir, bold: true }, ...(b.branch ? [dim(` (${b.branch})`)] : []), ...[b.agent, b.model].filter(Boolean).map(t => dim(` · ${t}`)),
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

// Desktop already shows dir, branch, model, context and usage (header, changes band, footer, ring popover), so the
// mod draws nothing while all is calm; once one segment needs attention, all show as pills (a lone one looks empty).
// share: 0-100. For ctx it runs to the hot threshold like the terminal bar, so a full pill means hot.
export type Kind = 'ctx' | '5h' | '7d' | 'model'
export type Badge = { kind: Kind; label?: string; value: string; share: number; level: Level; tip: string }
const clamp = (n: number) => Math.min(100, Math.max(0, n))
const WINDOW_NAMES: Record<string, string> = { '5h': 'Session limit', '7d': 'Weekly, all models' }

export const desktopSegments = (b: BarInput): Badge[] => {
  const all: Badge[] = []
  if (b.ctx) {
    all.push({
      kind: 'ctx', value: tokensText(b.ctx.tokens), share: clamp((b.ctx.tokens / ctxHot(b.ctx)) * 100), level: ctxBand(b.ctx),
      tip: `Context: ${tokensText(b.ctx.tokens)} of ${tokensText(b.ctx.window)} tokens`,
    })
  }
  for (const w of b.windows) {
    const left = w.resetsAt ? Date.parse(w.resetsAt) - b.now : 0
    const level = pace(w, b.now)
    all.push({
      kind: w.label === '5h' || w.label === '7d' ? w.label : 'model',
      label: w.label, value: `${Math.round(w.pct)}%`, share: clamp(w.pct), level,
      tip: [
        `${WINDOW_NAMES[w.label] ?? `Weekly, ${w.label}`}: ${Math.round(w.pct)}% used`,
        left > 0 && `resets in ${countdown(left)}`,
        w.resetsAt && (level ? 'ahead of pace' : 'on pace'),
      ].filter(Boolean).join(' · '),
    })
  }
  return all
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const two = (n: number) => String(n).padStart(2, '0')

// 18:40, or Tue 17:30 when the reset is on another day; the mod's clock follows the machine's zone
export const resetTime = (resetsAt: string, now: number) => {
  const d = new Date(Date.parse(resetsAt))
  const clock = `${two(d.getHours())}:${two(d.getMinutes())}`
  return d.toDateString() === new Date(now).toDateString() ? clock : `${DAYS[d.getDay()]} ${clock}`
}

// A row of the usage pane. share and tick are 0-100; tick marks the share of the window already elapsed (or, for the
// context, the warn threshold on the scale that runs to hot); detail is one dim line
export type PaneRow = { kind: Kind; name: string; value: string; share: number; tick?: number; level: Level; detail: string }

export const paneRows = (b: BarInput): PaneRow[] => {
  const rows: PaneRow[] = []
  if (b.ctx) {
    const hot = ctxHot(b.ctx)
    rows.push({
      kind: 'ctx', name: 'Context', value: tokensText(b.ctx.tokens), share: clamp((b.ctx.tokens / hot) * 100),
      tick: (CTX_WARN / hot) * 100, level: ctxBand(b.ctx),
      detail: `of ${tokensText(b.ctx.window)} · warn ${tokensText(CTX_WARN)} · hot ${tokensText(hot)}`,
    })
  }
  for (const w of b.windows) {
    const level = pace(w, b.now)
    const timed = w.resetsAt && w.windowMs
    const left = w.resetsAt ? Date.parse(w.resetsAt) - b.now : 0
    rows.push({
      kind: w.label === '5h' || w.label === '7d' ? w.label : 'model',
      name: WINDOW_NAMES[w.label] ?? `Weekly, ${w.label}`, value: `${Math.round(w.pct)}%`, share: clamp(w.pct),
      tick: timed ? elapsed(w.resetsAt!, w.windowMs!, b.now) * 100 : undefined, level,
      detail: [
        left > 0 && `resets in ${countdown(left)}`, w.resetsAt && resetTime(w.resetsAt, b.now),
        w.resetsAt && (level ? 'ahead of pace' : 'on pace'),
      ].filter(Boolean).join(' · '),
    })
  }
  return rows
}

// One Svg per pill, a meter: shape says which segment, color says severity only. An Svg cannot read CSS variables, so
// ink comes from a prefers-color-scheme style, and the status colors are translucent so the app's own surface shows
// through on light and dark. shortcut: width is estimated from the character count (an Svg has no font metrics); the
// OS scheme stands in for the app's, which differ only when the app is not on auto
const STATUS = { warn: '#fab219', hot: '#d03b3b' } as const
const GRAY = 'rgb(127,127,127)'
const FILL = { calm: 0.3, warn: 0.8, hot: 0.8 } as const // meter fill opacity; the track is a white chip when calm, .3 of the status color otherwise
const PILL_H = 28, ICON = 18, ICON_STROKE = 1.5
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// Tabler-style outline paths in a 24x24 box
const GLYPH: Record<Kind, string> = {
  ctx: '<path d="M12 4l-8 4l8 4l8-4z"/><path d="M4 12l8 4l8-4"/><path d="M4 16l8 4l8-4"/>',
  '5h': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  '7d': '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  model: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zM16 6a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6z"/>',
}

export const pill = (b: Badge) => {
  const color = b.level ? STATUS[b.level] : GRAY
  const text = (b.label ? b.label.length * 6.4 + 5 : 0) + b.value.length * 7.4 // measured live: 6.4 left the 5h pill ~7px short on the right
  const width = Math.ceil(12 + ICON + 7 + text + 12)
  const scale = ICON / 24
  const shape = `x=".5" y=".5" width="${width - 1}" height="${PILL_H - 1}" rx="${PILL_H / 2 - .5}"`
  return {
    width,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PILL_H}" viewBox="0 0 ${width} ${PILL_H}">`
      + `<title>${xml(b.tip)}</title>`
      + '<style>.i{fill:#1f1f1e}.d{fill:#6b6b6b}.p{stroke:#1f1f1e}.s{stroke:#6b6b6b}.t{fill:#fff;fill-opacity:.75}'
      + '@media (prefers-color-scheme:dark){.i{fill:#f0efe9}.d{fill:#a8a79f}.p{stroke:#f0efe9}.s{stroke:#a8a79f}.t{fill-opacity:.07}}</style>'
      + `<clipPath id="c"><rect ${shape}/></clipPath>`
      // a calm track is a white chip on the app's gray strip; a translucent gray one all but vanished there
      + `<rect ${shape} ${b.level ? `fill="${color}" fill-opacity=".3"` : 'class="t"'} stroke="${color}" stroke-opacity="${b.level ? '.7' : '.3'}"/>`
      + `<rect width="${+((width * b.share) / 100).toFixed(2)}" height="${PILL_H}" clip-path="url(#c)" fill="${color}" fill-opacity="${FILL[b.level ?? 'calm']}"/>`
      + `<g transform="translate(12 ${(PILL_H - ICON) / 2}) scale(${scale})" fill="none" stroke-width="${+(ICON_STROKE / scale).toFixed(2)}" `
      + `stroke-linecap="round" stroke-linejoin="round" class="${b.level ? 'p' : 's'}">${GLYPH[b.kind]}</g>`
      + `<text x="${12 + ICON + 7}" y="18.5" font-size="13" font-family="system-ui,-apple-system,sans-serif">`
      + (b.label ? `<tspan font-size="12" class="d">${xml(b.label)} </tspan>` : '')
      + `<tspan font-weight="500" class="i">${xml(b.value)}</tspan>`
      + '</text></svg>',
  }
}

// A pane row's meter: the pill's colors and track, a thin tick where the window's elapsed share (or the ctx warn level)
// falls. Not interactive, like every Svg here.
const METER_H = 12, METER_W = 280
export const meter = (r: PaneRow, width: number) => {
  const color = r.level ? STATUS[r.level] : GRAY
  const shape = `y="2" width="${width}" height="8" rx="4"`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${METER_H}" viewBox="0 0 ${width} ${METER_H}">`
    + '<style>.k{fill:#1f1f1e}.t{fill:#fff;fill-opacity:.75}@media (prefers-color-scheme:dark){.k{fill:#f0efe9}.t{fill-opacity:.07}}</style>'
    + `<clipPath id="c"><rect ${shape}/></clipPath>`
    + `<rect ${shape} ${r.level ? `fill="${color}" fill-opacity=".3"` : 'class="t"'} stroke="${color}" stroke-opacity="${r.level ? '.7' : '.3'}"/>`
    + `<rect y="2" width="${+((width * r.share) / 100).toFixed(2)}" height="8" clip-path="url(#c)" fill="${color}" fill-opacity="${FILL[r.level ?? 'calm']}"/>`
    + (r.tick === undefined ? '' : `<rect class="k" x="${+((width * r.tick) / 100 - 1).toFixed(2)}" y="0" width="2" height="${METER_H}" rx="1"/>`)
    + '</svg>'
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

// update() always writes and every write redraws, so a reading that has not changed must not reach it
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const toWindows = (ls: Limits, ws: Weekly, now: number): Win[] => [
  ...fresh(ls, now).map(l => ({ label: limitText(l), pct: l.percentUsed, resetsAt: l.resetsAt, windowMs: WINDOW_MS[l.kind] })),
  ...fresh(ws, now).map(w => ({ label: w.name, pct: w.percent, resetsAt: w.resetsAt, windowMs: WEEK })),
]

// what a passing minute can change on screen: each window's pace band, and its countdown text where one is drawn
// (the terminal draws it, Desktop does not)
export const minuteKey = (windows: Win[], now: number, countdowns = true) =>
  JSON.stringify(windows.map(w => [w.label, countdowns && w.resetsAt && countdown(Date.parse(w.resetsAt) - now), pace(w, now)]))

const refreshUsage = async ($: EngineInterface, force = false) => {
  try {
    const now = await $.clock.now()
    if (!force && now - (((await $.store.get('fetchedAt')) as number | undefined) ?? 0) < 300_000) return
    await $.store.set('fetchedAt', now) // claim the window so overlapping refreshes don't all fetch; store only, a state write redraws
    const auth = (await $.session.authorize())?.handle
    if (!auth) return
    const r = await $.http.fetch('https://api.anthropic.com/api/oauth/usage', {
      auth, headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
    if (!r.ok) return
    const u = parseUsage(r.text)
    if (u.limits.length && !same(u.limits, await read($, limits))) {
      await update($, limits, () => u.limits)
      await $.store.set('limits', u.limits)
    }
    if (u.weekly.length && !same(u.weekly, await read($, weekly))) {
      await update($, weekly, () => u.weekly)
      await $.store.set('weekly', u.weekly)
    }
  } catch {} // keep the last good rows
}

// press the button: close the pane if it is open, else open it. A Desktop that places no panes answers isPlaced false;
// the button then goes away
const toggleUsagePane = async ($: EngineInterface) => {
  if ((await $.ui.panes()).some(p => p.id === PANE)) return $.ui.close({ id: PANE })
  const { isPlaced } = await $.ui.open({ id: PANE, title: 'Usage' })
  if (!isPlaced) await update($, noPanes, () => true)
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
    // a reload drops this module's timers, so no cancel is kept. A tick redraws, so it fires only when a countdown
    // or pace band moved since the last one
    let seen = ''
    $.clock.every(60_000, () => void (async () => {
      const [ls, ws, now, surfaces, panes] = await Promise.all([read($, limits), read($, weekly), $.clock.now(), $.session.surfaces().catch(() => ['terminal'] as const), $.ui.panes().catch(() => [])]) // unknown surfaces: keep the countdown redraw
      // the usage pane draws countdowns too, so while it is open they count
      const key = minuteKey(toWindows(ls, ws, now), now, surfaces.includes('terminal') || panes.some(p => p.id === PANE))
      if (key !== seen) {
        seen = key
        await update($, tick, n => n + 1)
      }
    })())
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
    if (!r.deny && r.agentId && (await read($, agentModels))[r.agentId] !== r.model) {
      await update($, agentModels, ms => withModel(ms, r.agentId, r.model))
    }
    return r
  })

  // pushed after each turn and whenever a window moves a point, so the band redraws live
  on('session.measure', async ($, e, next) => {
    // absent until a request lands: keep the last seen reading so 5h/7d don't blink out
    if (e.rateLimits.length && !same(e.rateLimits, await read($, limits))) {
      await update($, limits, () => e.rateLimits)
      await $.store.set('limits', e.rateLimits)
    }
    const { tokens, window } = e.context
    const c = await read($, ctx)
    if (tokens !== undefined && window && (c?.tokens !== tokens || c.window !== window)) {
      await update($, ctx, () => ({ tokens, window }))
    }
    return next(e)
  })

  // the Usage button's pane: a meter row per reading, drawn only while open
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e) // only the Desktop button opens it
    const [c, ls, ws, now] = await Promise.all([read($, ctx), read($, limits), read($, weekly), $.clock.now(), read($, tick)])
    const rows = paneRows({ dir: '', ctx: c, windows: toWindows(ls, ws, now), now })
    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap={1}>
        {rows.map(r => (
          <Box flexDirection="column">
            <Box justifyContent="space-between"><Text>{r.name}</Text><Text bold>{r.value}</Text></Box>
            <Svg source={meter(r, METER_W)} alt={`${r.name}: ${r.value}`} width={METER_W} height={METER_H} />
            {r.detail && <Text dimColor>{r.detail}</Text>}
          </Box>
        ))}
        {!rows.length && <Text dimColor>Nothing to show yet.</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [root, home, model, c, ls, ws, now] = await Promise.all([
      $.session.root(), $.env.get('HOME'), $.session.model(), read($, ctx), read($, limits), read($, weekly),
      $.clock.now(), read($, tick),
    ])
    const windows = toWindows(ls, ws, now)
    // a subagent's transcript in view: its type and model; main's ctx and window say nothing about it
    const agentId = e.props.view?.agentId
    let shown: Pick<BarInput, 'agent' | 'model' | 'ctx'> = { model: model ? modelLabel(model, c?.window) : undefined, ctx: c }
    if (agentId) {
      const [ms, agents] = await Promise.all([read($, agentModels), $.agent.list()])
      const a = agents.find(a => a.id === agentId), m = ms[agentId]
      shown = { agent: a?.type ?? a?.name, model: m ? modelLabel(m) : undefined }
    }
    // desktop: limits on the left, context on the right; nothing the app doesn't already show, so no git call and, when calm, no band of ours
    if (e.surface === 'desktop') {
      const badges = desktopSegments({ dir: '', ...shown, windows, now })
      if (!badges.length) return next(e)
      const { Box, Svg, Button } = $.ui.resolve(e)
      const [below, gone] = await Promise.all([next(e), read($, noPanes)])
      return (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            {[badges.filter(x => x.label), badges.filter(x => !x.label)].map((group, i) => (
              <Box gap={1}>
                {group.map(badge => {
                  const { source, width } = pill(badge)
                  // never isInteractive: the engine rebuilds an interactive Svg on every redraw, which flickered the bar on
                  // send and turn complete, even for one pill. A native Button did not (usage-pane spike), so the click is one
                  // Button beside the pills, not on them
                  return <Svg source={source} alt={badge.tip} width={width} height={PILL_H} />
                })}
                {i === 0 && !gone && <Button key="usage" onPress={() => void toggleUsagePane($)}>Usage</Button>}
              </Box>
            ))}
          </Box>
          {below}
        </Box>
      )
    }
    // shortcut: one git spawn per redraw, no cache; detached HEAD reads "HEAD". Cache on turn.complete if it shows
    const git = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).catch(() => undefined)
    const branch = git?.exitCode === 0 ? git.stdout.trim() || undefined : undefined
    const runs = layout({ dir: shortDir(root, home), branch, ...shown, windows, now }, e.props.bodyColumns)
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
