import type { SessionContextUsage, SessionRateLimit, TurnUsage } from 'claude-code'

import type { Git } from '../types'

export type { Git }
export type Ctx = { kind: 'percent'; percent: number } | { kind: 'tokens'; tokens: number }
export type Window = { label: '5h' | '7d' | '$'; percent: number; resetsAt: number | null; length: number | null }
export type BarInput = { git: Git | null; agent: string | null; model: string | null; ctx: Ctx | null; windows: Window[]; now: number }
// badge: the tone fills the background behind the text instead of coloring it
export type Run = { text: string; tone: 'plain' | 'dim' | 'yellow' | 'red' | 'blue'; badge?: true }
export type Segment = Run[]
type Tone = Run['tone']

export const SEP = ' · '

const HOUR = 3_600_000
const WINDOWS = [
  ['five_hour', '5h', 5 * HOUR],
  ['seven_day', '7d', 168 * HOUR],
  ['spend_limit', '$', null],
] as const

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export const parseWindows = (limits: readonly SessionRateLimit[]): Window[] =>
  WINDOWS.flatMap(([kind, label, length]) => {
    const limit = limits.find(l => l.kind === kind)
    if (!limit || !finite(limit.percentUsed)) return []
    const resetsAt = typeof limit.resetsAt === 'string' ? Date.parse(limit.resetsAt) : NaN
    return [{ label, percent: limit.percentUsed, resetsAt: finite(resetsAt) ? resetsAt : null, length }]
  })

export const parseContext = (context: SessionContextUsage): Ctx | null =>
  finite(context.percent) ? { kind: 'percent', percent: context.percent } : null

export const parseWindowSize = (context: SessionContextUsage): number | undefined =>
  finite(context.window) && context.window > 0 ? context.window : undefined

export const stepTokens = (usage: TurnUsage): number | null => {
  const parts = [usage.input_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens]
  return parts.every(finite) ? parts.reduce((a, b) => a + b, 0) : null
}

export const parseGit = (porcelain: string): Git | null => {
  let oid: string | undefined
  let head: string | undefined
  let added = 0
  let changed = 0
  for (const row of porcelain.split('\n')) {
    if (row.startsWith('# branch.oid ')) oid = row.slice('# branch.oid '.length)
    else if (row.startsWith('# branch.head ')) head = row.slice('# branch.head '.length)
    else if (row.startsWith('? ')) added += 1
    else if (row.startsWith('1 ') && row.slice(2, 4).includes('A')) added += 1
    else if (row.startsWith('1 ') || row.startsWith('2 ') || row.startsWith('u ')) changed += 1
  }
  if (head === undefined) return null
  if (head === '(detached)') head = oid && oid !== '(initial)' ? oid.slice(0, 7) : 'HEAD'
  return { branch: head, added, changed }
}

const sizeLabel = (n: number) => (n >= 1e6 && n % 1e6 === 0 ? `${n / 1e6}M` : `${Math.round(n / 1000)}K`)

// claude-opus-5-5 -> Opus 5.5, claude-haiku-4-5-20251001 -> Haiku 4.5; the window, when known, follows
export const modelLabel = (id: string, window?: number) => {
  const m = /^claude-([a-z]+)((?:-\d{1,2})+)(?:-\d{8})?(\[1m\])?$/i.exec(id)
  if (!m) return id
  const [, name = '', version = '', big] = m
  const size = window ? sizeLabel(window) : big ? '1M' : ''
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${version.slice(1).replaceAll('-', '.')}${size ? ` ${size}` : ''}`
}

// at most two units: 1d7h, 2h40m, 12m, <1m
export const countdown = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60
  if (d) return h ? `${d}d${h}h` : `${d}d`
  if (h) return m ? `${h}h${m}m` : `${h}h`
  return `${m}m`
}

const threshold = (value: number, yellow: number, red: number): Tone =>
  value >= red ? 'red' : value >= yellow ? 'yellow' : 'plain'

const CELLS = 8

// delta: percent - mark, where mark is where an even pace stands now; tick: the cell boundary nearest the mark, 0..CELLS
type Pace = { kind: 'ahead' | 'on' | 'behind' | 'spent'; delta: number; tick: number }

// the goal is 100% at the reset: ahead runs out before it, behind leaves usage unspent
const pace = (w: Window, now: number): Pace | null => {
  if (w.resetsAt === null || w.length === null) return null
  const elapsedMs = Math.min(w.length, Math.max(0, w.length - (w.resetsAt - now)))
  const mark = (elapsedMs / w.length) * 100
  const delta = w.percent - mark
  const kind = w.percent >= 100 ? 'spent' : Math.abs(delta) <= 5 ? 'on' : delta > 0 ? 'ahead' : 'behind'
  return { kind, delta, tick: Math.round((mark / 100) * CELLS) }
}

const aheadTone = (delta: number): Tone => (delta > 20 ? 'red' : 'yellow')

// the word carries the pace on its own, so no meaning rests on telling colors apart
const PACE: Record<Pace['kind'], (p: Pace) => { word: string; tone: Tone }> = {
  ahead: p => ({ word: p.delta > 20 ? 'far ahead' : 'ahead', tone: aheadTone(p.delta) }),
  on: () => ({ word: '', tone: 'plain' }),
  behind: () => ({ word: 'behind', tone: 'blue' }),
  spent: () => ({ word: 'used up', tone: 'red' }),
}

type Arm = 'none' | 'light' | 'heavy'

// the tick takes each side's arm from the cell beside it, so the line stays unbroken
// and a fill that stops at the tick does not seem to run past it
const TICK: Record<Arm, Record<Arm, string>> = {
  none: { none: '┃', light: '┠', heavy: '┣' },
  light: { none: '┨', light: '╂', heavy: '╊' },
  heavy: { none: '┫', light: '╉', heavy: '╋' },
}

const FILLED: Run = { text: '━', tone: 'plain' }
const EMPTY: Run = { text: '─', tone: 'dim' }

// a half-used cell is thick on its left half only
const HALF = '╾'

const meter = (percent: number, cell: (i: number, filled: boolean) => Run, tick: number | null): Run[] => {
  const halves = Math.min(CELLS * 2, Math.round((percent / 100) * CELLS * 2))
  const glyphs = Array.from({ length: CELLS }, (_, i) => {
    const run = cell(i, halves > i * 2)
    return halves === i * 2 + 1 && run.text === '━' ? { ...run, text: HALF } : run
  })
  if (tick !== null) {
    const left = (c?: Run): Arm => (c ? (c.text === '━' ? 'heavy' : 'light') : 'none')
    const right = (c?: Run): Arm => (c ? (c.text === '─' ? 'light' : 'heavy') : 'none')
    glyphs.splice(tick, 0, { text: TICK[left(glyphs[tick - 1])][right(glyphs[tick])], tone: 'plain' })
  }
  return glyphs.reduce<Run[]>((runs, g) => {
    const last = runs.at(-1)
    if (last?.tone === g.tone) last.text += g.text
    else runs.push({ ...g })
    return runs
  }, [])
}

// The cells before the rounded tick are exactly those whose center is at or below the mark.
// A filled cell past it is overspend. On pace, a 12.5-point cell would otherwise flag a gap the word calls fine.
const paceCell = (p: Pace) => (i: number, filled: boolean): Run => {
  if (p.kind === 'on') return filled ? FILLED : EMPTY
  if (filled) return i < p.tick ? FILLED : { text: '━', tone: PACE[p.kind](p).tone }
  return EMPTY
}

type Detail = { meter: boolean; word: boolean }

const DETAILS: readonly Detail[] = [
  { meter: true, word: true },
  { meter: false, word: true },
  { meter: false, word: false },
]

// the branch keeps this many cells before the gauges give up their meters and words
const GIT_KEEPS = 12

const ctxSegment = (ctx: Ctx): Segment => {
  const dim: Run = { text: 'ctx ', tone: 'dim' }
  if (ctx.kind === 'tokens') return [dim, { text: sizeLabel(ctx.tokens), tone: 'plain' }]
  const percent = Math.round(ctx.percent)
  return [dim, { text: `${percent}%`, tone: threshold(percent, 70, 85) }]
}

const windowSegment = (w: Window, now: number, detail: Detail): Segment => {
  const p = pace(w, now)
  const shown = p ? PACE[p.kind](p) : null
  const tone = shown ? shown.tone : threshold(w.percent, 50, 80)
  const cell = p ? paceCell(p) : (_: number, filled: boolean): Run => (filled ? { text: '━', tone } : EMPTY)
  return [
    { text: `${w.label} `, tone: 'dim' },
    ...(detail.meter ? [...meter(w.percent, cell, p?.tick ?? null), { text: ' ', tone: 'dim' } as const] : []),
    { text: `${Math.round(w.percent)}%`, tone: shown ? 'plain' : tone },
    ...(detail.word && shown?.word ? [{ text: ' ', tone: 'dim' } as const, { text: ` ${shown.word} `, tone, badge: true } as const] : []),
    ...(w.resetsAt === null ? [] : [{ text: ` ↻${countdown(w.resetsAt - now)}`, tone: 'dim' } as const]),
  ]
}

export const width = (segment: Segment) => segment.reduce((n, run) => n + [...run.text].length, 0)

const rowWidth = (row: Segment[]) => row.reduce((n, s) => n + width(s), 0) + SEP.length * Math.max(0, row.length - 1)

const gitText = ({ branch, added, changed }: Git) =>
  branch + (added ? ` +${added}` : '') + (changed ? ` ~${changed}` : '')

const gaugesAt = (input: BarInput, detail: Detail): Segment[] => {
  const gauges: Segment[] = []
  if (input.agent) gauges.push([{ text: input.agent, tone: 'dim' }])
  if (input.model) gauges.push([{ text: input.model, tone: 'plain' }])
  if (input.ctx) gauges.push(ctxSegment(input.ctx))
  for (const w of input.windows) {
    if (w.resetsAt === null || w.resetsAt > input.now) gauges.push(windowSegment(w, input.now, detail))
  }
  return gauges
}

export const segments = (input: BarInput, columns: number): Segment[] => {
  const text = input.git ? [...gitText(input.git)] : []
  const kept = input.git ? Math.min(text.length, GIT_KEEPS) + SEP.length : 0
  const ladder = DETAILS.map(detail => gaugesAt(input, detail))
  const gauges = ladder.find(g => rowWidth(g) + kept <= columns) ?? ladder.at(-1)!
  if (!input.git) return gauges
  const room = columns - rowWidth(gauges) - (gauges.length ? SEP.length : 0)
  if (text.length <= room) return [[{ text: text.join(''), tone: 'plain' }], ...gauges]
  return room >= 2 ? [[{ text: `${text.slice(0, room - 1).join('')}…`, tone: 'plain' }], ...gauges] : gauges
}
