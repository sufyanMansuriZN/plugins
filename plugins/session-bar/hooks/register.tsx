import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { AgentModels, Cache, Ctx, Limits, Weekly } from '../types'

// Calm segments are plain text in the terminal's own colors, so they read on any theme (it can be `auto`,
// which a mod cannot resolve). Only a segment that needs attention becomes a pill: orange, or vermillion when
// hot (Okabe-Ito), with dark text that reads on both. Color, and the pill shape, always mean "look here".
const ATTN = { warn: '#E69F00', hot: '#D55E00' } as const
const ON_ATTN = '#191919'

const limits = atom({ plugin: 'session-bar', key: 'limits' } as const, [] as Limits)
const weekly = atom({ plugin: 'session-bar', key: 'weekly' } as const, [] as Weekly)
const ctx = atom({ plugin: 'session-bar', key: 'ctx' } as const, null as Ctx | null) // null until a reading, and after a compaction; state takes JSON, so not undefined
const agentModels = atom({ plugin: 'session-bar', key: 'agentModels' } as const, {} as AgentModels)
const tick = atom({ plugin: 'session-bar', key: 'tick' } as const, 0) // bumped each minute so countdowns move while idle
const usageOpen = atom({ plugin: 'session-bar', key: 'usageOpen' } as const, false) // the Desktop usage block; collapsed each session
const cache = atom({ plugin: 'session-bar', key: 'cache' } as const, null as Cache | null) // null until a TTL is known; state takes JSON, so not undefined

// a subagent's model into the map; the same map when main's step or a repeat leaves it as it was
export const withModel = (ms: AgentModels, agentId: string | undefined, model: string): AgentModels =>
  !agentId || ms[agentId] === model ? ms : { ...ms, [agentId]: model }

export type Level = keyof typeof ATTN | undefined

// raw share used: windows with no reset time to pace against
export const band = (pct: number): Level => pct >= 80 ? 'hot' : pct >= 50 ? 'warn' : undefined

// Context by tokens sent, not window share: quality, latency and cost track tokens. Warn at 150K, the API's
// default compaction trigger; hot at 250K, past which long-context scores drop, capped at 80% of the compaction point
// (the window when it is unread) so a smaller window or auto-compact setting still turns hot before it compacts. Warn
// is never capped: with a ~60K baseline, half of a 200K window would fire after a few reads.
// Sources: openspec/changes/session-bar-visual-redesign/research-context-size.md
export const CTX_WARN = 150_000
export const ctxHot = ({ window, compactAt }: Ctx) => Math.min(250_000, (compactAt ?? window) * 0.8)
export const ctxBand = (c: Ctx): Level =>
  c.tokens >= ctxHot(c) ? 'hot' : c.tokens >= CTX_WARN ? 'warn' : undefined

// The prompt cache keeps the context cheap to resend for its TTL after the last request was sent; past it the next
// message pays for all of it again. Below 100K a miss costs little, so no state shows there
export const CACHE_MIN = 100_000
const CACHE_SOON = 5 * 60_000
export type CacheState = { state: 'active' | 'warm' | 'soon' | 'cold'; left: number }

// the TTL one response's cache write took, from a transcript's text (a tail whose first line is cut is fine). The line
// lands after the step's result and carries no id, so it is the newest whose cache-read and uncached input counts are
// the step's. 1h only when none of it took 5m, as the 5m part goes cold first. No line yet, or a match that wrote
// nothing: undefined, and the last TTL stands
export const cacheTtl = (text: string, read: number, input: number): number | undefined => {
  for (const line of text.split('\n').reverse()) {
    let u: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } } | undefined
    try { u = JSON.parse(line)?.message?.usage } catch { continue }
    if (!u || u.cache_read_input_tokens !== read || u.input_tokens !== input) continue
    const h1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0, m5 = u.cache_creation?.ephemeral_5m_input_tokens ?? 0
    return h1 || m5 ? m5 ? 5 * 60_000 : HOUR : undefined
  }
}

// counted from the last main request's send: a wait after its response, a tool, a dialog or a subagent included, is
// idle time for the cache. Nothing before the first request or while the TTL is unknown
export const cacheState = (c: Cache | null | undefined, tokens: number | undefined, now: number): CacheState | undefined => {
  if (!c?.ttlMs || tokens === undefined || tokens < CACHE_MIN) return
  // a streaming request is the cache in use, so no countdown applies; the pill keeps its glyph and width. One that named
  // another model is cold until its response ends, as the cache is keyed by model
  if (c.inFlight) return c.cold ? { state: 'cold', left: 0 } : { state: 'active', left: c.ttlMs }
  const left = c.sentAt + c.ttlMs - now
  return { state: left <= 0 ? 'cold' : left < CACHE_SOON ? 'soon' : 'warm', left: Math.max(0, left) }
}

// The proof of the values above, one debug line per main request: each prediction beside what was measured, so a mismatch
// reads as a bug. predicted: the cache state when the request was sent, none when none was shown; prevTotal: the previous
// request's total input, which a warm cache serves nearly all of (within 2%); shown: the context tokens drawn after this
// request, total this request's input; endpoint: the usage endpoint's windows, none until one was fetched
export const accuracyLine = (a: { predicted?: CacheState['state']; read: number; prevTotal?: number; shown?: number; total: number; header: Limits; endpoint?: Limits }) => {
  const hit = a.prevTotal === undefined ? undefined : Math.abs(a.read - a.prevTotal) <= a.prevTotal * 0.02
  const cacheOk = a.predicted === undefined || hit === undefined ? 'unscored' : (a.predicted !== 'cold') === hit ? 'confirmed' : 'wrong'
  return [
    `cache predicted ${a.predicted ?? 'none'}, read ${a.read} of ${a.prevTotal ?? '?'}: ${cacheOk}`,
    `ctx shown ${a.shown ?? '?'}, input ${a.total}: ${a.shown === a.total ? 'match' : 'differ'}`,
    ...a.header.map(l => `${limitText(l)} header ${Math.round(l.percentUsed)}% endpoint ${(e => e ? `${Math.round(e.percentUsed)}%` : 'n/a')(a.endpoint?.find(x => x.kind === l.kind))}`),
  ].join(' | ')
}

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
// agent: the type of the subagent whose transcript is in view; absent on main. answered: the label of the model that
// answered the last main request when it is not the configured one (a fallback)
export type BarInput = { dir: string; branch?: string; agent?: string; model?: string; answered?: string; ctx?: Ctx; cache?: CacheState; windows: Win[]; now: number }
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

// one symbol for every state, the text after it says which; orange only when it is about to go cold. The narrowest
// tier drops the countdown, as it does the 5h one
const cacheRun = (c: CacheState, short: boolean): Run =>
  c.state === 'cold' ? { text: '❄ cold', dimColor: true }
    : c.state === 'active' ? { text: short ? '❄' : '❄ in use', dimColor: true }
    : { text: short ? '❄' : `❄ ${countdown(c.left)}`, ...(c.state === 'soon' ? { color: ATTN.warn } : { dimColor: true }) }

export const segments = (b: BarInput, tier: Tier): Run[] => {
  const dim = (text: string): Run => ({ text, dimColor: true })
  const meter = (label: string, pct: number, level: Level, value = `${Math.round(pct)}%`, after?: string | Run, tick?: number) => {
    const { used, rest } = bar(pct, tier < 2 ? 10 : 5, tick)
    return segment(level, [
      dim(`${label} `),
      ...(tier < 3 ? [{ text: used }, dim(rest), { text: ' ' }] : []),
      { text: value },
      ...(typeof after === 'string' ? [dim(` ${after}`)] : after ? [{ ...after, text: ` ${after.text}` }] : []),
    ])
  }

  const groups: Run[][] = [[
    { text: b.dir, bold: true }, ...(b.branch ? [dim(` (${b.branch})`)] : []), ...[b.agent, b.model].filter(Boolean).map(t => dim(` · ${t}`)),
  ]]
  if (b.ctx) {
    // the bar runs to the hot threshold, so bar and color share one scale: full means hot, the tick marks warn
    const hot = ctxHot(b.ctx)
    groups.push(meter('ctx', (b.ctx.tokens / hot) * 100, ctxBand(b.ctx), tokensText(b.ctx.tokens), b.cache && cacheRun(b.cache, tier === 4), CTX_WARN / hot))
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
export type Badge = { kind: Kind; label?: string; value: string; share: number; level: Level; tip: string; cache?: CacheState['state'] }

// the words for a cache state, on the pill's hover and in the usage block
const cacheText = (c: CacheState, tokens: number) =>
  c.state === 'cold' ? `cache cold, the next message re-reads ${tokensText(tokens)}`
    : c.state === 'active' ? 'cache in use' : `cache cold in ${countdown(c.left)}`
const clamp = (n: number) => Math.min(100, Math.max(0, n))
const WINDOW_NAMES: Record<string, string> = { '5h': 'Session limit', '7d': 'Weekly, all models' }

export const desktopSegments = (b: BarInput): Badge[] => {
  const all: Badge[] = []
  if (b.ctx) {
    all.push({
      kind: 'ctx', value: tokensText(b.ctx.tokens), share: clamp((b.ctx.tokens / ctxHot(b.ctx)) * 100), level: ctxBand(b.ctx),
      tip: `Context: ${tokensText(b.ctx.tokens)} of ${tokensText(b.ctx.window)} tokens${b.cache ? ` · ${cacheText(b.cache, b.ctx.tokens)}` : ''}`,
      cache: b.cache?.state,
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

// A row of the Desktop usage block. share and shadow are 0-100; shadow is the share of the window already gone, so
// a quota meant to be used up reads as room (shadow past the fill) or overspend (fill past it); line is one dim line
// more: dim lines after line; line2 comes last and is the cache line, whose glyph cache picks
export type UsageRow = { kind: Kind; name: string; value: string; share: number; shadow?: number; level: Level; line: string; more?: string[]; line2?: string; cache?: CacheState['state'] }

// the app's own names, in the block only: the pills keep 5h, 7d and the model
const rowName = (label: string) => label === '5h' ? 'Session limit' : label === '7d' ? 'Weekly · all models' : `Weekly · ${label}`

export const usageRows = (b: BarInput): UsageRow[] => {
  const rows: UsageRow[] = []
  if (b.ctx) {
    // the scale runs to the ideal ceiling, as the pill's does; the window is a fact, not the scale
    const hot = ctxHot(b.ctx), level = ctxBand(b.ctx)
    rows.push({
      kind: 'ctx', name: 'Context', value: tokensText(b.ctx.tokens), share: clamp((b.ctx.tokens / hot) * 100), level,
      line: (level === 'hot' ? `Past ${tokensText(hot)}, quality drops` : level ? 'Past the ideal range' : `Ideal under ${tokensText(CTX_WARN)}`)
        + ` · window ${tokensText(b.ctx.window)}`,
      ...(b.answered && { more: [`Answered by ${b.answered}`] }),
      ...(b.cache && { line2: (s => s[0]!.toUpperCase() + s.slice(1))(cacheText(b.cache, b.ctx.tokens)), cache: b.cache.state }),
    })
  }
  for (const w of b.windows) {
    const row = { kind: w.label === '5h' || w.label === '7d' ? w.label : 'model', name: rowName(w.label), value: `${Math.round(w.pct)}%`, share: clamp(w.pct), level: pace(w, b.now) } as const
    if (!w.resetsAt || !w.windowMs) {
      rows.push({ ...row, line: '' })
      continue
    }
    const gone = elapsed(w.resetsAt, w.windowMs, b.now), left = Date.parse(w.resetsAt) - b.now
    // paceBand's 15-point warn rule; the cap time only once a tenth has gone, as earlier the rate is noise
    const ahead = w.pct - gone * 100
    let line: string
    if (ahead > 15) {
      const cap = gone >= 0.1 && w.pct > 0 ? ((100 - w.pct) / w.pct) * gone * w.windowMs : undefined
      line = `Ahead of pace${cap === undefined ? '' : ` · hits the cap in about ${countdown(Math.round(cap / 60_000) * 60_000)}`}`
    } else {
      line = `${ahead < -15 ? 'Room to use more' : 'On pace'} · resets ${left < 24 * HOUR ? `in ${countdown(left)}` : resetTime(w.resetsAt, b.now)}`
    }
    rows.push({ ...row, shadow: gone * 100, line })
  }
  return rows
}

// One Svg per pill, a meter: shape says which segment. A calm quota has a hue of its own (Okabe-Ito, none near amber or
// red), the calm context stays gray, and attention replaces either with amber or red. An Svg cannot read CSS variables, so
// ink comes from a prefers-color-scheme style, and the status colors are translucent so the app's own surface shows
// through on light and dark. shortcut: width is estimated from the character count (an Svg has no font metrics); the
// OS scheme stands in for the app's, which differ only when the app is not on auto
const STATUS = { warn: '#fab219', hot: '#d03b3b' } as const
const GRAY = 'rgb(127,127,127)'
// The green is written #2c8e68 so it shows as #009a68, 3:1 on white: Desktop draws an Svg's colors shifted, which a
// linear-light matrix fitted on four sampled pairs predicts (#009E73 drawn #00ac74, #173c95 drawn #280695)
const HUE: Record<Kind, string> = { ctx: GRAY, '5h': '#0072B2', '7d': '#2c8e68', model: '#CC79A7' }
// pill fill opacity when calm; an attention fill's is per scheme (sb-fwarn, sb-fhot in INK). The track is a white chip when
// calm, .3 of the status color otherwise
const CALM_FILL = 0.3
// the approved mockup's pill: 24px high, 10px sides, an icon about the 12px text's height, 5px between icon, label and value
const PILL_H = 24, PILL_PAD = 10, ICON = 15, ICON_STROKE = 1.5, ICON_GAP = 5
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
// the inks, from the OS scheme as an Svg cannot read the app's variables: i/d text, p an icon stroke, t a calm track,
// b the pill's neutral hairline, fwarn/fhot an attention fill's opacity. Each text and icon is 4.5:1 or more on its pill
// with a margin for Desktop drawing an Svg's colors more saturated (#d03b3b read #e82250): the dim label on a calm hue,
// and the ink on an amber or red fill and on its pale track alike, as a text often sits on both. So the red is .55 on
// light, and the amber .25 on dark, where the ink is light
const INK = '<style>.sb-i{fill:#1f1f1e}.sb-d{fill:#555550}.sb-p{stroke:#1f1f1e}.sb-t{fill:#fff;fill-opacity:.75}.sb-b{stroke:#1f1f1e;stroke-opacity:.15}'
  + '.sb-fwarn{fill-opacity:.8}.sb-fhot{fill-opacity:.55}'
  + '@media (prefers-color-scheme:dark){.sb-i{fill:#f0efe9}.sb-d{fill:#bdbcb4}.sb-p{stroke:#f0efe9}.sb-t{fill-opacity:.07}.sb-b{stroke:#f0efe9;stroke-opacity:.2}'
  // dark: the red firmer against its track with the ink still 4.8:1; the calm blue firmer too, its label still 4.7:1
  // (the green and pink have no such room: their label drops under 4.5:1 first)
  + '.sb-fwarn{fill-opacity:.25}.sb-fhot{fill-opacity:.85}.sb-f5h{fill-opacity:.6}}</style>'
// a 24px Tabler glyph drawn ICON wide at (x, y), for the pills and the usage block alike
const glyph = (x: number, y: number, paths: string, ink: 'sb-p' | 'sb-a') => {
  const scale = ICON / 24
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke-width="${+(ICON_STROKE / scale).toFixed(2)}" `
    + `stroke-linecap="round" stroke-linejoin="round" class="${ink}">${paths}</g>`
}

// Tabler-style outline paths in a 24x24 box
const GLYPH: Record<Kind, string> = {
  ctx: '<path d="M12 4l-8 4l8 4l8-4z"/><path d="M4 12l8 4l8-4"/><path d="M4 16l8 4l8-4"/>',
  '5h': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  '7d': '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  model: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zM16 6a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6z"/>',
}

// the cache state after the context's value: shape says which, in the same ink, as the pill's color already means context
const FLAME = '<path d="M12 10.941c2.333-3.308.167-7.823-1-8.941c0 3.395-2.235 5.299-3.667 6.706c-1.43 1.408-2.333 3.621-2.333 5.588c0 3.704 3.134 6.706 7 6.706s7-3.002 7-6.706c0-1.712-1.232-4.403-2.333-5.588c-2.084 3.353-3.257 3.353-4.667 2.235"/>'
const CACHE_GLYPH: Record<CacheState['state'], string> = {
  active: FLAME, // warm too, so a send moves nothing on the pill
  warm: FLAME,
  soon: '<path d="M6.5 7h11"/><path d="M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z"/><path d="M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1z"/>',
  cold: '<path d="M10 4l2 1l2-1M12 2v6.5l3 1.72M17.928 6.268l.134 2.232l1.866 1.232M20.66 7l-5.629 3.25l.01 3.458'
    + 'M19.928 14.268l-1.866 1.232l-.134 2.232M20.66 17l-5.629-3.25l-2.99 1.738M14 20l-2-1l-2 1M12 22v-6.5l-3-1.72'
    + 'M6.072 17.732l-.134-2.232l-1.866-1.232M3.34 17l5.629-3.25l-.01-3.458M4.072 9.732l1.866-1.232l.134-2.232M3.34 7l5.629 3.25l2.99-1.738"/>',
}

// a glyph on its own, for the usage block: the pill's size and stroke in the approved mockup's accent blue (a lighter one
// on dark). The gap is inside it, as a Box gap is a whole cell (8px); 2px reads as the pill's 5px, as Desktop draws more
// room after an Svg. 1px up: centered on the line box, it sat 1px under the baseline
export const ROW_GAP = 2
export const icon = (paths: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON + ROW_GAP}" height="${ICON}" viewBox="0 0 ${ICON + ROW_GAP} ${ICON}">`
  // #084f95 shows as the mockup's #173c95 once Desktop shifts it (see HUE)
  + '<style>.sb-a{stroke:#084f95}@media (prefers-color-scheme:dark){.sb-a{stroke:#85b7eb}}</style>'
  + glyph(0, -1, paths, 'sb-a') + '</svg>'

// Desktop may place the markup in its own page, where a <style> and an id would reach every element: so every class
// is sb- prefixed and each Svg has its own clip id
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

// what a pill keeps at a desktop tier: its dim label (5h, 7d, the model) and its icon
export type PillParts = { label: boolean; icon: boolean }
const FULL: PillParts = { label: true, icon: true }

export const pill = (b: Badge, parts: PillParts = FULL) => {
  const color = b.level ? STATUS[b.level] : HUE[b.kind]
  const clip = `sb-c-pill-${b.kind}-${slug(b.label ?? '')}`
  const label = parts.label ? b.label : undefined
  // the approved mockup's pill: 10px sides, 5px between icon, label and value, all 12px text
  const x = parts.icon ? PILL_PAD + ICON + ICON_GAP : PILL_PAD
  const text = (label ? label.length * 6.4 + ICON_GAP : 0) + b.value.length * 6.8 // 12px: 6.4 a label char measured live, 7.4 at 13px scaled
  const cached = parts.icon && b.cache ? b.cache : undefined // the narrowest tier drops every icon, this one too
  const width = Math.ceil(x + text + (cached ? ICON_GAP + ICON : 0) + PILL_PAD)
  const icon = (at: number, paths: string) => glyph(at, (PILL_H - ICON) / 2, paths, 'sb-p') // the primary ink, as the mockup's
  const shape = `x=".5" y=".5" width="${width - 1}" height="${PILL_H - 1}" rx="${PILL_H / 2 - .5}"`
  return {
    width,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PILL_H}" viewBox="0 0 ${width} ${PILL_H}">`
      + `<title>${xml(b.tip)}</title>`
      + INK
      + `<clipPath id="${clip}"><rect ${shape}/></clipPath>`
      // a calm track is a white chip on the app's gray strip; a translucent gray one all but vanished there
      // the mockup's hairline: neutral, not the pill's hue
      + `<rect ${shape} ${b.level ? `fill="${color}" fill-opacity=".3" class="sb-b"` : 'class="sb-t sb-b"'}/>`
      + `<rect width="${+((width * b.share) / 100).toFixed(2)}" height="${PILL_H}" clip-path="url(#${clip})" fill="${color}" ${b.level ? `class="sb-f${b.level}"` : `fill-opacity="${CALM_FILL}" class="sb-f${b.kind}"`}/>`
      + (parts.icon ? icon(PILL_PAD, GLYPH[b.kind]) : '')
      + (cached ? icon(+(x + text + ICON_GAP).toFixed(2), CACHE_GLYPH[cached]) : '')
      + `<text x="${x}" y="16.5" font-size="12" font-family="system-ui,-apple-system,sans-serif">`
      + (label ? `<tspan class="${b.level ? 'sb-i' : 'sb-d'}">${xml(label)}</tspan>` : '') // no dim gray passes on amber or red
      // regular weight, as the label: a heavier value (500 or 700) drew wider once the usage block opened, the label never did;
      // the primary ink against the label's dim one keeps it the stronger part
      + `<tspan${label ? ` dx="${ICON_GAP}"` : ''} class="sb-i">${xml(b.value)}</tspan>`
      + '</text></svg>',
  }
}

// The desktop bar is one row that never wraps: like the terminal's tiers, it sheds pill parts until the pills and the
// button fit: labels first (the icons still tell the pills apart), then the button's name down to arrows
// (`compact`), and the icons last: a warning swaps a pill's own hue for amber or red, so without its icon two warning
// pills would look alike. Only the narrowest window (33 cells, ~264px) drops them.
// px per bodyColumns cell: 8, measured live against the pills' own widths at 55 cells (~441px) and 161 (~1292px)
const PX_PER_COL = 8, GAP_PX = 8 // gap={1}: one cell
export type DesktopTier = PillParts & { compact: boolean }
export const DESKTOP_TIERS: DesktopTier[] = [
  { label: true, icon: true, compact: false },
  { label: false, icon: true, compact: false },
  { label: false, icon: true, compact: true },
  { label: false, icon: false, compact: true },
]
// a compact button is one glyph, the same open or not: a Button holds only text, and Unicode has an arrows-out
// character but no arrows-in one (an Svg laid over the button drew a second icon, not one)
export const buttonText = (t: DesktopTier) => t.compact ? '⤢' : 'Usage details'
const buttonPx = (t: DesktopTier) => buttonText(t).length * 6.5 + 16

// the richest tier that fits the band; each pill and the button carry a gap, which also holds the two groups apart
export const desktopTier = (badges: Badge[], columns?: number): DesktopTier => {
  const room = columns ? columns * PX_PER_COL : Infinity
  return DESKTOP_TIERS.find(t => badges.reduce((n, b) => n + pill(b, t).width + GAP_PX, buttonPx(t) + GAP_PX) <= room)
    ?? DESKTOP_TIERS[DESKTOP_TIERS.length - 1]!
}

// A usage row's meter, as the approved mockup: a plain gray track with no outline, the fill solid in the pill's color,
// and behind the fill a darker shadow as wide as the window's share gone. No tick, no legend. Not interactive, like
// every Svg here. No viewBox: the Svg takes its cell's width from the flex layout and the rects are percentages of it,
// so nothing is stretched and the round ends keep their pixel radius
const METER_H = 6
export const meter = (r: UsageRow) => {
  const color = r.level ? STATUS[r.level] : HUE[r.kind]
  const shape = `width="100%" height="${METER_H}" rx="${METER_H / 2}"`
  const clip = `sb-c-meter-${slug(r.name)}`
  const part = (share: number, attrs: string) => `<rect width="${+share.toFixed(2)}%" height="${METER_H}" clip-path="url(#${clip})" ${attrs}/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${METER_H}">`
    // as the approved mockup: a plain gray track, no outline, the fill solid in its own color
    // grays firm enough that the time-gone band reads against the track (light 1.3:1 and dark 1.5:1 were too faint)
    + '<style>.sb-t{fill:#d9d9d9}.sb-k{fill:#bdbdbd}.sb-g{fill:#fff}'
    + '@media (prefers-color-scheme:dark){.sb-t{fill:#2f2f2e}.sb-k{fill:#525250}.sb-g{fill:#0b0b0b}}</style>'
    + `<clipPath id="${clip}"><rect ${shape}/></clipPath>`
    + `<rect ${shape} class="sb-t"/>`
    + (r.shadow === undefined ? '' : part(clamp(r.shadow), 'class="sb-k"'))
    + part(r.share, `fill="${color}"`)
    // a 2px gap in the card's color where the fill meets the shadow: most fills sit under 3:1 against the gray, so the
    // edge shows by the gap, not the contrast (the card's ground read live: white, and #0b0b0b on dark)
    + (r.shadow !== undefined && r.share > 0 && clamp(r.shadow) > r.share
      ? `<rect x="${+r.share.toFixed(2)}%" width="2" height="${METER_H}" clip-path="url(#${clip})" class="sb-g"/>` : '')
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
// The cache state always counts; its countdown where one is drawn (the terminal, or the open usage block)
export const minuteKey = (windows: Win[], now: number, countdowns = true, cache?: CacheState, cacheCountdown = countdowns) =>
  JSON.stringify([
    windows.map(w => [w.label, countdowns && w.resetsAt && countdown(Date.parse(w.resetsAt) - now), pace(w, now)]),
    cache && [cache.state, cacheCountdown && cache.state !== 'cold' && countdown(cache.left)],
  ])

// the pills show whole numbers, and a header's 23.4 is the endpoint's 23: compare those, so the same reading from the two
// sources does not redraw
const whole = (ls: Limits) => ls.map(l => ({ ...l, percentUsed: Math.round(l.percentUsed) }))

// when the usage readings were last fetched, once that is old enough to matter
export const usageAge = (at: number | undefined, now: number) =>
  at !== undefined && now - at > 10 * 60_000 ? `Usage as of ${resetTime(new Date(at).toISOString(), now)}` : undefined

// fetchedAt is the claim that stops overlapping fetches, written before the fetch; usageAt is written on success only, so a
// failed fetch never makes the readings look fresh
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
    const p = parseUsage(r.text)
    const u = { limits: fresh(p.limits, now), weekly: fresh(p.weekly, now) } // a window the endpoint still answers past its reset says nothing
    await $.store.set('usageAt', now)
    await $.store.set('endpoint', u.limits) // what the accuracy line sets the header against
    if (u.limits.length && !same(whole(u.limits), whole(await read($, limits)))) {
      await update($, limits, () => u.limits)
      await $.store.set('limits', u.limits)
    }
    if (u.weekly.length && !same(u.weekly, await read($, weekly))) {
      await update($, weekly, () => u.weekly)
      await $.store.set('weekly', u.weekly)
    }
  } catch {} // keep the last good rows
}

// The TTL is in the transcript alone. classic.Stop, which names the file, never fired on Desktop, so the file is found
// by the session id under each projects folder (its folder name is the cwd, encoded): once a module load.
// shortcut: <HOME>/.claude/projects only; read CLAUDE_CONFIG_DIR if anyone sets it
let transcript: string | undefined
const findTranscript = async ($: EngineInterface) => {
  if (transcript) return transcript
  const [id, home] = await Promise.all([$.session.id(), $.env.get('HOME')])
  const root = `${home}/.claude/projects`
  for (const d of await $.fs.list(root)) {
    if (await $.fs.exists(`${root}/${d.name}/${id}.jsonl`)) return transcript = `${root}/${d.name}/${id}.jsonl`
  }
}

// the TTL of the last main request, from its transcript line, which lands about 100 ms after the step's result: read at
// the next step's entry and at the turn's end (spike 1.1). tail, not $.fs.read: that refuses files over 4 MiB, which the
// long sessions this is for pass. No match or any failure keeps the last TTL
const readTtl = async ($: EngineInterface) => {
  try {
    const c = await read($, cache)
    if (!c || c.read === undefined || c.input === undefined) return
    const path = await findTranscript($)
    const r = path ? await $.process.run(['tail', '-c', '65536', path]) : undefined
    const ttlMs = r?.exitCode === 0 ? cacheTtl(r.stdout, c.read, c.input) : undefined
    if (ttlMs && ttlMs !== c.ttlMs) await update($, cache, p => p && { ...p, ttlMs })
  } catch {}
}

// where auto-compaction runs, from the context breakdown: 'summary' estimates locally and sends no request ('full' sends
// token counts). Once per main turn, never per redraw: it took 691 ms the first time (spike 1.3). Absent with auto-compact off
const readCompactAt = async ($: EngineInterface) => {
  try {
    const c = await read($, ctx)
    if (!c) return
    const compactAt = (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.autoCompactThreshold
    if (c.compactAt !== compactAt) await update($, ctx, p => p && { ...p, compactAt })
  } catch {}
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
      const [ls, ws, now, surfaces, open, c, cached, usageAt] = await Promise.all([read($, limits), read($, weekly), $.clock.now(), $.session.surfaces().catch(() => ['terminal'] as const), read($, usageOpen), read($, ctx), read($, cache), $.store.get('usageAt') as Promise<number | undefined>]) // unknown surfaces: keep the countdown redraw
      const windows = toWindows(ls, ws, now), terminal = surfaces.includes('terminal')
      // the open usage block draws countdowns, cap times and the reading's age too, so while it is open its lines count
      const key = minuteKey(windows, now, terminal, cacheState(cached, c?.tokens, now), terminal || open)
        + (open ? JSON.stringify([usageRows({ dir: '', windows, now }).map(r => r.line), usageAge(usageAt, now)]) : '')
      if (key !== seen) {
        seen = key
        await update($, tick, n => n + 1)
      }
      // other sessions' spend shows without a turn once the reading is over 5 minutes old. A window past its reset is
      // fetched at once, past refreshUsage's gate, and dropped from the atoms now: one forced fetch per reset, not one a
      // minute while the endpoint still answers the old window. A detached session fetches nothing
      const stale = fresh(ls, now).length < ls.length || fresh(ws, now).length < ws.length
      if (fresh(ls, now).length < ls.length) await update($, limits, () => fresh(ls, now))
      if (fresh(ws, now).length < ws.length) await update($, weekly, () => fresh(ws, now))
      if (surfaces.length && (stale || now - (usageAt ?? 0) > 300_000)) await refreshUsage($, stale)
    })())
    return next(e)
  })

  // sending a prompt collapses the usage block, so it does not hold the composer down through the turn; no
  // outside-click event exists. Read first: a write redraws even when the value is the same. The cache is not
  // touched: a local slash command sends no request
  on('prompt.submit', async ($, e, next) => {
    if (await read($, usageOpen)) await update($, usageOpen, () => false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) { // the last step's line is there by now; a subagent's loop has a cache of its own
      await readTtl($)
      await readCompactAt($)
    }
    await refreshUsage($)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      // $.agent.list() names no model, so a subagent's is kept from its requests, a fallback's included.
      // update() always writes, so look first: most steps repeat the model the agent already has
      if ((await read($, agentModels))[e.agentId] !== e.model) await update($, agentModels, ms => withModel(ms, e.agentId, e.model))
      return yield* next(e)
    }
    // the main loop's request is the cache clock: its send restarts the TTL, and the response's end starts the countdown
    await readTtl($)
    const [now, before, prev] = await Promise.all([$.clock.now(), read($, ctx), read($, cache)])
    // what the bar says of the cache at the send, kept for the accuracy line
    const predicted = prev?.model && prev.model !== e.model ? 'cold' : cacheState(prev, before?.tokens, now)?.state
    await update($, cache, c => ({ ...c, sentAt: now, inFlight: true, ...(c?.model && c.model !== e.model && { cold: true as const }) }))
    let usage: TurnUsage | null = null
    try {
      const r = yield* next(e)
      usage = r.usage
      return r
    } finally { // an aborted stream ends the request too
      await update($, cache, c => c && {
        ...c, cold: undefined, inFlight: false,
        ...(usage && { model: usage.model, read: usage.cache_read_input_tokens, input: usage.input_tokens }),
      })
      if (usage) {
        try { // session.measure fired at the stream's end, so ctx and limits already hold this request's readings
          const [after, header, endpoint] = await Promise.all([read($, ctx), read($, limits), $.store.get('endpoint')])
          $.ui.log(accuracyLine({
            predicted, read: usage.cache_read_input_tokens, prevTotal: before?.tokens, shown: after?.tokens,
            total: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens, header, endpoint: endpoint as Limits | undefined,
          }), { to: 'debug' })
        } catch {}
      }
    }
  })

  // a compaction of the main conversation that ran leaves no cache state: the next request reads the shared prefix, so
  // neither cold nor the old countdown is right until its response ends. Nor a context reading: session.measure repeats
  // the old count through it and never reports one absent (spike 1.2), so this is the only place to drop it. A precompute
  // or a skip changes nothing
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (r.messages && e.trigger !== 'precompute' && !e.agentId) {
      if (await read($, cache)) await update($, cache, () => null)
      if (await read($, ctx)) await update($, ctx, () => null)
    }
    return r
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
    if (e.rateLimits.length && !same(whole(e.rateLimits), whole(await read($, limits)))) {
      await update($, limits, () => e.rateLimits)
      await $.store.set('limits', e.rateLimits)
    }
    const { tokens, window } = e.context
    const c = await read($, ctx)
    if (tokens !== undefined && window && (c?.tokens !== tokens || c.window !== window)) {
      await update($, ctx, p => ({ ...p, tokens, window })) // keeps the threshold read at the turn's end
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [root, home, model, c, ls, ws, now, , cached] = await Promise.all([
      $.session.root(), $.env.get('HOME'), $.session.model(), read($, ctx), read($, limits), read($, weekly),
      $.clock.now(), read($, tick), read($, cache),
    ])
    const windows = toWindows(ls, ws, now)
    // a subagent's transcript in view: its type and model; main's ctx, window and cache say nothing about it
    const agentId = e.props.view?.agentId
    let shown: Pick<BarInput, 'agent' | 'model' | 'answered' | 'ctx' | 'cache'> = {
      model: model ? modelLabel(model, c?.window) : undefined, ctx: c ?? undefined, cache: cacheState(cached, c?.tokens, now),
      // the configured id may carry [1m], which the API's does not
      answered: cached?.model && model && cached.model !== model.replace(/\[1m\]$/i, '') ? modelLabel(cached.model) : undefined,
    }
    if (agentId) {
      const [ms, agents] = await Promise.all([read($, agentModels), $.agent.list()])
      const a = agents.find(a => a.id === agentId), m = ms[agentId]
      shown = { agent: a?.type ?? a?.name, model: m ? modelLabel(m) : undefined }
    }
    // desktop: limits on the left, context on the right; nothing the app doesn't already show, so no git call and, when calm, no band of ours
    if (e.surface === 'desktop') {
      const badges = desktopSegments({ dir: '', ...shown, windows, now })
      if (!badges.length) return next(e)
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      const [below, open] = await Promise.all([next(e), read($, usageOpen)])
      const tier = desktopTier(badges, e.props.bodyColumns)
      const rows = open ? usageRows({ dir: '', ...shown, windows, now }) : []
      const age = open ? usageAge((await $.store.get('usageAt')) as number | undefined, now) : undefined
      // two rows per line, one where two would break every line (under ~520px)
      const perLine = (e.props.bodyColumns ?? Infinity) * PX_PER_COL < 520 ? 1 : 2
      const pairs = rows.flatMap((r, i) => i % perLine ? [] : [rows.slice(i, i + perLine)])
      // the pill's glyph before a row's name or its cache line, so a row reads as its pill; a narrow column cuts the text,
      // never the glyph. Its alt names the pill it matches; Desktop draws nothing for an empty one
      const iconed = (paths: string, alt: string, text: JSX.Element) => (
        <Box alignItems="center"><Box flexShrink={0}><Svg source={icon(paths)} alt={alt} width={ICON + ROW_GAP} height={ICON} /></Box>{text}</Box>
      )
      return (
        <Box flexDirection="column">
          {/* the room above the pills is a gap: Desktop drew no marginBottom. None while collapsed, or the empty slot above
              the pills fattens the bar. The block is the mockup's card: the theme's inverse ink as its ground (white on
              light), a round border, and padding that tightens with one row a line, as the band's height runs out there */}
          <Box flexDirection="column" gap={open ? 1 : 0}>
            {open && (
              <Box flexDirection="column" gap={perLine === 2 ? 2 : 1} backgroundColor="inverseText" borderStyle="round" borderColor="promptBorder" padding={perLine === 2 ? 2 : 1}>
                {pairs.map(pair => (
                  <Box gap={3}>
                    {pair.map(r => {
                      const bar = <Svg source={meter(r)} alt={`${r.name}: ${r.value}`} height={METER_H} />
                      const name = iconed(GLYPH[r.kind], `${r.kind === 'ctx' ? 'context' : r.kind} pill`, <Text wrap="truncate-end">{r.name}</Text>)
                      const more = r.more?.map(t => <Text dimColor>{t}</Text>)
                      const line2 = r.line2 && (r.cache ? iconed(CACHE_GLYPH[r.cache], `cache ${r.cache}`, <Text dimColor>{r.line2}</Text>) : <Text dimColor>{r.line2}</Text>)
                      // one per line: name, meter and value share a line, 2 lines a row instead of 3, so the block fits
                      // the band's height and the pills never scroll out of view
                      return perLine === 2 ? (
                        <Box flexDirection="column" width="50%" flexShrink={1}>
                          <Box justifyContent="space-between"><Box flexShrink={1}>{name}</Box><Text bold>{r.value}</Text></Box>
                          {bar}
                          {r.line && <Text dimColor>{r.line}</Text>}
                          {more}
                          {line2}
                        </Box>
                      ) : (
                        <Box flexDirection="column" width="100%">
                          <Box gap={1} alignItems="center">
                            <Box width="34%" flexShrink={0}>{name}</Box>
                            <Box flexGrow={1} flexDirection="column">{bar}</Box>
                            <Box width={6} flexShrink={0} justifyContent="flex-end"><Text bold>{r.value}</Text></Box>
                          </Box>
                          {r.line && <Text dimColor>{r.line}</Text>}
                          {more}
                          {line2}
                        </Box>
                      )
                    })}
                  </Box>
                ))}
                {age && <Text dimColor>{age}</Text>}
              </Box>
            )}
            {/* one row, never wrapped: the tier sheds parts to fit instead */}
            <Box justifyContent="space-between">
              {[badges.filter(x => x.label), badges.filter(x => !x.label)].map((group, i) => (
                <Box gap={1}>
                  {group.map(badge => {
                    const { source, width } = pill(badge, tier)
                    // never isInteractive: the engine rebuilds an interactive Svg on every redraw, which flickered the bar on
                    // send and turn complete, even for one pill. A native Button did not (usage-pane spike), so the click is one
                    // Button beside the pills, not on them. The hover text is the surface's own reveal of a hidden child:
                    // no hook runs, so nothing redraws (cache-timer spike); Desktop floats it above the band
                    return (
                      <Box key={`pill-${badge.kind}-${slug(badge.label ?? '')}`}>
                        <Svg source={source} alt={badge.tip} width={width} height={PILL_H} />
                        <Box position="absolute" left={0} display="none" hover={{ display: 'flex' }}><Text>{badge.tip}</Text></Box>
                      </Box>
                    )
                  })}
                  {i === 0 && (
                    <Button key="usage" plain onPress={() => void update($, usageOpen, o => !o)}>{buttonText(tier)}</Button>
                  )}
                </Box>
              ))}
            </Box>
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
