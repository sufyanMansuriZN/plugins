import type { SessionContextUsage, SessionRateLimit, TurnUsage } from 'claude-code'

import type { Git } from '../types'

export type { Git }
export type Ctx = { kind: 'percent'; percent: number } | { kind: 'tokens'; tokens: number }
export type Window = { label: '5h' | '7d' | '$'; percent: number; resetsAt: number | null; length: number | null }
// where: the repo's name, or the directory's outside a repo; resetMark: what stands before a reset
// countdown, chosen by the surface's fonts
export type BarInput = {
  where: string | null; git: Git | null; agent: string | null; model: string | null; ctx: Ctx | null; windows: Window[]; now: number; resetMark: string
}
// a colored tone exists only on a badge, which fills the background behind the text
export type Run = { text: string; tone: 'plain' | 'dim'; badge?: never } | { text: string; tone: 'yellow' | 'red' | 'blue'; badge: true }
export type Segment = Run[]
// left: what the session is (where, branch, agent, model); right: the gauges, pinned to the band's right edge
export type Zones = { left: Segment[]; right: Segment[] }
// what an alert asks for: nothing, or a badge in one of the colors
type Tone = 'plain' | Extract<Run, { badge: true }>['tone']

export const SEP = ' · '
// the fewest cells between the zones; the render's margin and the fit both use it, so a fitted row never wraps
export const GAP = SEP.length

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

export const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

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

// the word carries the pace on its own, so no meaning rests on telling colors apart
const PACE: Record<Pace['kind'], (p: Pace) => { word: string; tone: Tone }> = {
  ahead: p => (p.delta > 20 ? { word: 'far ahead', tone: 'red' } : { word: 'ahead', tone: 'yellow' }),
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

// a half-used cell is thick on its left half only
const meter = (percent: number, tick: number | null): Run[] => {
  const halves = Math.min(CELLS * 2, Math.round((percent / 100) * CELLS * 2))
  const glyphs = Array.from({ length: CELLS }, (_, i): Run =>
    halves > i * 2 + 1 ? { text: '━', tone: 'plain' } : halves === i * 2 + 1 ? { text: '╾', tone: 'plain' } : { text: '─', tone: 'dim' })
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

// Color is only ever a badge's background, behind black text: a colored glyph on the terminal's own
// background cannot keep its contrast on both light and dark themes.
const alert = (text: string, tone: Tone): Run => (tone === 'plain' ? { text, tone } : { text: ` ${text} `, tone, badge: true })

type Detail = { meter: boolean; word: boolean }

const DETAILS: readonly Detail[] = [
  { meter: true, word: true },
  { meter: false, word: true },
  { meter: false, word: false },
]

const ctxSegment = (ctx: Ctx): Segment => {
  const dim: Run = { text: 'ctx ', tone: 'dim' }
  if (ctx.kind === 'tokens') return [dim, { text: sizeLabel(ctx.tokens), tone: 'plain' }]
  const percent = Math.round(ctx.percent)
  return [dim, alert(`${percent}%`, threshold(percent, 70, 85))]
}

const windowSegment = (w: Window, now: number, resetMark: string, detail: Detail): Segment => {
  const p = pace(w, now)
  const shown = p ? PACE[p.kind](p) : null
  const percent = `${Math.round(w.percent)}%`
  return [
    { text: `${w.label} `, tone: 'dim' },
    ...(detail.meter ? [...meter(w.percent, p?.tick ?? null), { text: ' ', tone: 'dim' } as const] : []),
    shown ? { text: percent, tone: 'plain' } : alert(percent, threshold(w.percent, 50, 80)),
    ...(detail.word && shown?.word ? [{ text: ' ', tone: 'dim' } as const, alert(shown.word, shown.tone)] : []),
    ...(w.resetsAt === null ? [] : [{ text: ` ${resetMark}${countdown(w.resetsAt - now)}`, tone: 'dim' } as const]),
  ]
}

const cells = (text: string) => [...text].length

export const width = (segment: Segment) => segment.reduce((n, run) => n + cells(run.text), 0)

const rowWidth = (row: Segment[]) => row.reduce((n, s) => n + width(s), 0) + SEP.length * Math.max(0, row.length - 1)

// the cells the right zone takes with the gap before it; an empty zone takes none
const rightWidth = (right: Segment[]) => (right.length ? GAP + rowWidth(right) : 0)

const gitText = ({ branch, added, changed }: Git) =>
  branch + (added ? ` +${added}` : '') + (changed ? ` ~${changed}` : '')

type Key = 'where' | 'branch' | 'agent' | 'model'
type Name = { key: Key; text: string; tone: 'plain' | 'dim' }

const namesOf = (input: BarInput): Name[] => {
  const all: [Key, string | null, Name['tone']][] = [
    ['where', input.where, 'plain'],
    ['branch', input.git && gitText(input.git), 'plain'],
    ['agent', input.agent, 'dim'],
    ['model', input.model, 'plain'],
  ]
  return all.flatMap(([key, text, tone]) => (text ? [{ key, text, tone }] : []))
}

// the cells each name keeps while the right zone still has meters or words to give up; the rest keep all
const KEEPS: Partial<Record<Key, number>> = { branch: 12 }
// after the right zone's last step, the names that give up cells, first one first; agent and model are never cut
const SHEDS: readonly Key[] = ['branch', 'where']

const namesWidth = (names: Name[], keeps: Partial<Record<Key, number>> = {}) =>
  names.reduce((n, x) => n + Math.min(cells(x.text), keeps[x.key] ?? Infinity), 0) + SEP.length * Math.max(0, names.length - 1)

// a cut name ends with …; one with fewer than 2 cells of room is left out
const cut = (text: string, room: number): string | null =>
  cells(text) <= room ? text : room >= 2 ? `${[...text].slice(0, room - 1).join('')}…` : null

const shed = (names: Name[], key: Key, room: number): Name[] => {
  const over = namesWidth(names) - room
  if (over <= 0) return names
  return names.flatMap(n => {
    if (n.key !== key) return [n]
    const text = cut(n.text, cells(n.text) - over)
    return text === null ? [] : [{ ...n, text }]
  })
}

const gaugesAt = (input: BarInput, detail: Detail): Segment[] => [
  ...(input.ctx ? [ctxSegment(input.ctx)] : []),
  ...input.windows
    .filter(w => w.resetsAt === null || w.resetsAt > input.now)
    .map(w => windowSegment(w, input.now, input.resetMark, detail)),
]

export const segments = (input: BarInput, columns: number): Zones => {
  const names = namesOf(input)
  const kept = namesWidth(names, KEEPS)
  const ladder = DETAILS.map(detail => gaugesAt(input, detail))
  const right = ladder.find(g => kept + rightWidth(g) <= columns) ?? ladder.at(-1)!
  const room = columns - rightWidth(right)
  const left = SHEDS.reduce((left, key) => shed(left, key, room), names)
  return { left: left.map(n => [{ text: n.text, tone: n.tone }]), right }
}
