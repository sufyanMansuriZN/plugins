import type { Git } from '../types'
import { type BarInput, type Ink, type Run, type Segment, BADGE, GAP, SEP, segments, toWindows, width } from './bar'
import type { Limit } from './usage'

// Claude Code draws the status line two cells in and keeps two free at its end; a longer row is cut with …
export const FREE_CELLS = 4

type Rate = { used_percentage?: unknown; resets_at?: unknown }
// the part of Claude Code's statusLine JSON the row reads
export type StatusJson = {
  workspace?: { project_dir?: unknown }
  rate_limits?: { five_hour?: Rate; seven_day?: Rate }
  prompt_cache?: { warm?: unknown; expires_at?: unknown } | null
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// Claude Code's times are Unix seconds; one that is not a number counts as none
const fromSeconds = (value: unknown): number | null => (finite(value) ? value * 1000 : null)

// this session's last reply carries the 5h and 7d windows, and no model's own window
const replyLimits = (json: StatusJson): Limit[] =>
  (['five_hour', 'seven_day'] as const).flatMap((kind): Limit[] => {
    const rate = json.rate_limits?.[kind]
    return rate && finite(rate.used_percentage) ? [{ kind, percent: rate.used_percentage, resetsAt: fromSeconds(rate.resets_at) }] : []
  })

const cacheEnd = (json: StatusJson): number | null =>
  json.prompt_cache?.warm === true ? fromSeconds(json.prompt_cache.expires_at) : null

// what the script reads beside the JSON: git in the session's root, and session-bar's shared reading
export type Local = { where: string | null; git: Git | null; shared: readonly Limit[]; now: number }

// The status line shows what holds in every view: the repo, its branch, the usage windows and the cache.
// The model and the context follow the transcript in view, which the statusLine JSON never names, so the band draws them.
export const statusInput = (json: StatusJson, { where, git, shared, now }: Local): BarInput => ({
  where, git, agent: null, model: null, ctx: null, now,
  windows: toWindows([...replyLimits(json), ...shared.filter(l => l.kind === 'model')]),
  cache: cacheEnd(json),
})

// the band's terminal look in SGR: a badge is bold black on its fixed color, the branch has robbyrussell's
// named colors, a dim run is dim; plain text gets no escape, so it keeps the color Claude Code gives the line
const INK: Record<Ink, string> = { paren: '1;34', branch: '31' }
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(';')
const sgr = (r: Run): string | null =>
  r.badge ? `1;38;2;0;0;0;48;2;${rgb(BADGE[r.tone])}` : r.ink ? INK[r.ink] : r.tone === 'dim' ? '2' : null
const paint = (runs: Run[]) => runs.map(r => {
  const code = sgr(r)
  return code ? `\x1b[${code}m${r.text}\x1b[0m` : r.text
}).join('')

const zone = (segs: Segment[]): Run[] => segs.flatMap((seg, i): Run[] => (i ? [{ text: SEP, tone: 'dim' }, ...seg] : seg))

// The left zone, then the right one at the row's end. Claude Code trims a row's leading spaces,
// so a right zone alone starts the row.
export const render = (input: BarInput, columns: number): string => {
  const room = columns - FREE_CELLS
  const { left, right } = segments(input, room)
  const [l, r] = [zone(left), zone(right)]
  if (!l.length || !r.length) return paint([...l, ...r])
  return `${paint(l)}${' '.repeat(Math.max(GAP, room - width(l) - width(r)))}${paint(r)}`
}
