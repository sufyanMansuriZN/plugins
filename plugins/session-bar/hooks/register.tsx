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
const usageOpen = atom({ plugin: 'session-bar', key: 'usageOpen' } as const, false) // the Desktop usage block; collapsed each session

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

// A row of the Desktop usage block. share and shadow are 0-100; shadow is the share of the window already gone, so
// a quota meant to be used up reads as room (shadow past the fill) or overspend (fill past it); line is one dim line
export type UsageRow = { kind: Kind; name: string; value: string; share: number; shadow?: number; level: Level; line: string }

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
const HUE: Record<Kind, string> = { ctx: GRAY, '5h': '#0072B2', '7d': '#009E73', model: '#CC79A7' }
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
  const x = parts.icon ? 12 + ICON + 7 : 12
  const text = (label ? label.length * 6.4 + 5 : 0) + b.value.length * 7.4 // measured live: 6.4 left the 5h pill ~7px short on the right
  const width = Math.ceil(x + text + 12)
  const scale = ICON / 24
  const shape = `x=".5" y=".5" width="${width - 1}" height="${PILL_H - 1}" rx="${PILL_H / 2 - .5}"`
  return {
    width,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PILL_H}" viewBox="0 0 ${width} ${PILL_H}">`
      + `<title>${xml(b.tip)}</title>`
      + '<style>.sb-i{fill:#1f1f1e}.sb-d{fill:#6b6b6b}.sb-p{stroke:#1f1f1e}.sb-s{stroke:#6b6b6b}.sb-t{fill:#fff;fill-opacity:.75}'
      + '@media (prefers-color-scheme:dark){.sb-i{fill:#f0efe9}.sb-d{fill:#a8a79f}.sb-p{stroke:#f0efe9}.sb-s{stroke:#a8a79f}.sb-t{fill-opacity:.07}}</style>'
      + `<clipPath id="${clip}"><rect ${shape}/></clipPath>`
      // a calm track is a white chip on the app's gray strip; a translucent gray one all but vanished there
      + `<rect ${shape} ${b.level ? `fill="${color}" fill-opacity=".3"` : 'class="sb-t"'} stroke="${color}" stroke-opacity="${b.level ? '.7' : '.3'}"/>`
      + `<rect width="${+((width * b.share) / 100).toFixed(2)}" height="${PILL_H}" clip-path="url(#${clip})" fill="${color}" fill-opacity="${FILL[b.level ?? 'calm']}"/>`
      + (parts.icon ? `<g transform="translate(12 ${(PILL_H - ICON) / 2}) scale(${scale})" fill="none" stroke-width="${+(ICON_STROKE / scale).toFixed(2)}" `
        + `stroke-linecap="round" stroke-linejoin="round" class="${b.level ? 'sb-p' : 'sb-s'}">${GLYPH[b.kind]}</g>` : '')
      + `<text x="${x}" y="18.5" font-size="13" font-family="system-ui,-apple-system,sans-serif">`
      + (label ? `<tspan font-size="12" class="sb-d">${xml(label)} </tspan>` : '')
      // regular weight, as the label: a heavier value (500 or 700) drew wider once the usage block opened, the label never did;
      // the primary ink against the label's dim one keeps it the stronger part
      + `<tspan font-size="13" class="sb-i">${xml(b.value)}</tspan>`
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

// A usage row's meter: the pill's colors and track, and behind the fill a pale shadow as wide as the window's share
// gone. No tick, no legend. Not interactive, like every Svg here. No viewBox: the Svg takes its cell's width from the
// flex layout and the rects are percentages of it, so nothing is stretched and the round ends keep their pixel radius.
// The border is a 2px stroke clipped to the track, so 1px shows inside it at any width
const METER_H = 8
export const meter = (r: UsageRow) => {
  const color = r.level ? STATUS[r.level] : HUE[r.kind]
  const shape = `width="100%" height="${METER_H}" rx="${METER_H / 2}"`
  const clip = `sb-c-meter-${slug(r.name)}`
  const part = (share: number, attrs: string) => `<rect width="${+share.toFixed(2)}%" height="${METER_H}" clip-path="url(#${clip})" ${attrs}/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${METER_H}">`
    + '<style>.sb-k{fill:#1f1f1e;fill-opacity:.14}.sb-t{fill:#fff;fill-opacity:.75}@media (prefers-color-scheme:dark){.sb-k{fill:#f0efe9;fill-opacity:.16}.sb-t{fill-opacity:.07}}</style>'
    + `<clipPath id="${clip}"><rect ${shape}/></clipPath>`
    + `<rect ${shape} clip-path="url(#${clip})" ${r.level ? `fill="${color}" fill-opacity=".3"` : 'class="sb-t"'} stroke="${color}" stroke-width="2" stroke-opacity="${r.level ? '.7' : '.3'}"/>`
    + (r.shadow === undefined ? '' : part(clamp(r.shadow), 'class="sb-k"'))
    // a calm fill firmer than the pill's, so its edge stands out from the gray shadow behind it
    + part(r.share, `fill="${color}" fill-opacity="${r.level ? FILL[r.level] : 0.55}"`)
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
      const [ls, ws, now, surfaces, open] = await Promise.all([read($, limits), read($, weekly), $.clock.now(), $.session.surfaces().catch(() => ['terminal'] as const), read($, usageOpen)]) // unknown surfaces: keep the countdown redraw
      const windows = toWindows(ls, ws, now)
      // the open usage block draws countdowns and cap times too, so while it is open its lines count
      const key = minuteKey(windows, now, surfaces.includes('terminal')) + (open ? JSON.stringify(usageRows({ dir: '', windows, now }).map(r => r.line)) : '')
      if (key !== seen) {
        seen = key
        await update($, tick, n => n + 1)
      }
    })())
    return next(e)
  })

  // sending a prompt collapses the usage block, so it does not hold the composer down through the turn; no
  // outside-click event exists. Read first: a write redraws even when the value is the same
  on('prompt.submit', async ($, e, next) => {
    if (await read($, usageOpen)) await update($, usageOpen, () => false)
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
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      const [below, open] = await Promise.all([next(e), read($, usageOpen)])
      const tier = desktopTier(badges, e.props.bodyColumns)
      const rows = open ? usageRows({ dir: '', ...shown, windows, now }) : []
      // two rows per line, one where two would break every line (under ~520px)
      const perLine = (e.props.bodyColumns ?? Infinity) * PX_PER_COL < 520 ? 1 : 2
      const pairs = rows.flatMap((r, i) => i % perLine ? [] : [rows.slice(i, i + perLine)])
      return (
        <Box flexDirection="column">
          {/* the room above the pills is a gap: Desktop drew no marginBottom. Compact rows space tighter, as the band's
              height is what runs out there */}
          <Box flexDirection="column" gap={perLine === 2 ? 3 : 1}>
            {open && (
              <Box flexDirection="column" gap={perLine === 2 ? 2 : 1}>
                {pairs.map(pair => (
                  <Box gap={3}>
                    {pair.map(r => {
                      const bar = <Svg source={meter(r)} alt={`${r.name}: ${r.value}`} height={METER_H} />
                      // one per line: name, meter and value share a line, 2 lines a row instead of 3, so the block fits
                      // the band's height and the pills never scroll out of view
                      return perLine === 2 ? (
                        <Box flexDirection="column" width="50%" flexShrink={1}>
                          <Box justifyContent="space-between"><Text>{r.name}</Text><Text bold>{r.value}</Text></Box>
                          {bar}
                          {r.line && <Text dimColor>{r.line}</Text>}
                        </Box>
                      ) : (
                        <Box flexDirection="column" width="100%">
                          <Box gap={1} alignItems="center">
                            <Box width="34%" flexShrink={0}><Text wrap="truncate-end">{r.name}</Text></Box>
                            <Box flexGrow={1} flexDirection="column">{bar}</Box>
                            <Box width={6} flexShrink={0} justifyContent="flex-end"><Text bold>{r.value}</Text></Box>
                          </Box>
                          {r.line && <Text dimColor>{r.line}</Text>}
                        </Box>
                      )
                    })}
                  </Box>
                ))}
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
                    // Button beside the pills, not on them
                    return <Svg source={source} alt={badge.tip} width={width} height={PILL_H} />
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
