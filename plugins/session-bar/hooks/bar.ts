import type { SessionContextUsage, SessionRateLimit, TurnUsage } from 'claude-code'

import type { Git } from '../types'

export type { Git }
export type Ctx = { kind: 'percent'; percent: number } | { kind: 'tokens'; tokens: number }
export type Window = { label: '5h' | '7d' | '$'; percent: number; resetsAt: number | null; length: number | null }
export type BarInput = { git: Git | null; agent: string | null; model: string | null; ctx: Ctx | null; windows: Window[]; now: number }
export type Run = { text: string; tone: 'plain' | 'dim' | 'yellow' | 'red' }
export type Segment = Run[]

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

const threshold = (value: number, yellow: number, red: number): Run['tone'] =>
  value >= red ? 'red' : value >= yellow ? 'yellow' : 'plain'

// against an even pace through the window: 61% on day 6 is calm, 71% an hour into 5h is not
const paceTone = (w: Window, now: number): Run['tone'] => {
  if (w.resetsAt === null || w.length === null) return threshold(w.percent, 50, 80)
  const elapsed = Math.min(1, Math.max(0, 1 - (w.resetsAt - now) / w.length))
  const ahead = w.percent - elapsed * 100
  return ahead > 30 || w.percent >= 90 ? 'red' : ahead > 15 ? 'yellow' : 'plain'
}

const ctxSegment = (ctx: Ctx): Segment => {
  const dim: Run = { text: 'ctx ', tone: 'dim' }
  if (ctx.kind === 'tokens') return [dim, { text: sizeLabel(ctx.tokens), tone: 'plain' }]
  const percent = Math.round(ctx.percent)
  return [dim, { text: `${percent}%`, tone: threshold(percent, 70, 85) }]
}

const windowSegment = (w: Window, now: number): Segment => [
  { text: `${w.label} `, tone: 'dim' },
  { text: `${Math.round(w.percent)}%`, tone: paceTone(w, now) },
  ...(w.resetsAt === null ? [] : [{ text: ` ↻${countdown(w.resetsAt - now)}`, tone: 'dim' } as const]),
]

export const width = (segment: Segment) => segment.reduce((n, run) => n + [...run.text].length, 0)

const gitText = ({ branch, added, changed }: Git) =>
  branch + (added ? ` +${added}` : '') + (changed ? ` ~${changed}` : '')

export const segments = (input: BarInput, columns: number): Segment[] => {
  const gauges: Segment[] = []
  if (input.agent) gauges.push([{ text: input.agent, tone: 'dim' }])
  if (input.model) gauges.push([{ text: input.model, tone: 'plain' }])
  if (input.ctx) gauges.push(ctxSegment(input.ctx))
  for (const w of input.windows) {
    if (w.resetsAt === null || w.resetsAt > input.now) gauges.push(windowSegment(w, input.now))
  }
  if (!input.git) return gauges
  const room = columns - gauges.reduce((n, s) => n + width(s), 0) - SEP.length * gauges.length
  const text = [...gitText(input.git)]
  if (text.length <= room) return [[{ text: text.join(''), tone: 'plain' }], ...gauges]
  return room >= 2 ? [[{ text: `${text.slice(0, room - 1).join('')}…`, tone: 'plain' }], ...gauges] : gauges
}
