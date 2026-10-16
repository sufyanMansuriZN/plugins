import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export type Kind = 'five_hour' | 'seven_day' | 'spend_limit'
const WINDOWS: Record<Kind, { label: string; ms?: number }> = {
  five_hour: { label: '5h', ms: 5 * HOUR },
  seven_day: { label: '7d', ms: 168 * HOUR },
  spend_limit: { label: '$' },
}
const KINDS = Object.keys(WINDOWS) as Kind[]
const isKind = (k: string): k is Kind => Object.hasOwn(WINDOWS, k)
const ENDPOINT_KINDS = new Map<unknown, Kind>([['session', 'five_hour'], ['weekly_all', 'seven_day']])

export type Limit = { kind: Kind; pct: number; resetsAt?: number }
export type Reading = { limits: Limit[]; at: number }
export type Git = { branch: string; added: number; changed: number }
export type Snapshot = { git?: Git; model: string; window?: number; ctx?: number; limits: Limit[] }

type Level = '' | '!' | '!!'

const tokensText = (n: number) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`

// the id carries [1m] only sometimes, so a known window wins over it
export const modelLabel = (id: string, window?: number) => {
  const size = window ? ` ${tokensText(window)}` : ''
  const { name, ver, big } = /^claude-(?<name>[a-z]+)(?<ver>(?:-\d{1,2})+)(?:-\d{8})?(?<big>\[1m\])?$/i.exec(id)?.groups ?? {}
  if (!name || !ver) return id + size
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${ver.slice(1).replaceAll('-', '.')}${size || (big ? ' 1M' : '')}`
}

export const countdown = (ms: number) => {
  const m = Math.floor(ms / MINUTE), h = Math.floor(m / 60), d = Math.floor(h / 24)
  return d ? `${d}d${h % 24 ? `${h % 24}h` : ''}`
    : h ? `${h}h${m % 60 ? `${m % 60}m` : ''}`
    : m ? `${m}m` : '<1m'
}

// usage against the share of the window gone: 61% on day 6 is calm, 71% an hour and a half into 5h is not
const pace = (l: Limit, now: number): Level => {
  const windowMs = WINDOWS[l.kind].ms
  if (l.resetsAt === undefined || windowMs === undefined) return l.pct >= 80 ? '!!' : l.pct >= 50 ? '!' : ''
  const elapsed = Math.min(1, Math.max(0, 1 - (l.resetsAt - now) / windowMs))
  const ahead = l.pct - elapsed * 100
  return ahead > 30 || l.pct >= 90 ? '!!' : ahead > 15 ? '!' : ''
}

const gitText = (g: Git) => [g.branch, g.added && `+${g.added}`, g.changed && `~${g.changed}`].filter(Boolean).join(' ')

const limitText = (l: Limit, now: number) =>
  `${WINDOWS[l.kind].label} ${Math.round(l.pct)}%${pace(l, now)}${l.resetsAt === undefined ? '' : ` ↻${countdown(l.resetsAt - now)}`}`

export const line = (s: Snapshot, now: number): string => [
  s.git && gitText(s.git),
  modelLabel(s.model, s.window),
  s.ctx !== undefined && `ctx ${s.ctx}%${s.ctx >= 85 ? '!!' : s.ctx >= 70 ? '!' : ''}`,
  ...KINDS.flatMap(kind => s.limits.filter(l => l.kind === kind))
    .filter(l => l.resetsAt === undefined || l.resetsAt > now)
    .map(l => limitText(l, now)),
].filter(Boolean).join(' · ')

export const newest = (...rs: (Reading | undefined)[]) =>
  rs.reduce<Reading | undefined>((a, r) => r && (!a || r.at > a.at) ? r : a, undefined)

export const parseGit = (out: string): Git => {
  let branch = 'HEAD', oid = '', added = 0, changed = 0
  for (const row of out.split('\n')) {
    if (row.startsWith('# branch.oid ')) oid = row.slice(13)
    else if (row.startsWith('# branch.head ')) branch = row.slice(14)
    else if (row.startsWith('? ')) added++
    else if (/^[12u] /.test(row)) row[2] === 'A' ? added++ : changed++
  }
  if (branch === '(detached)') branch = /^[0-9a-f]{7,}$/.test(oid) ? oid.slice(0, 7) : 'HEAD'
  return { branch, added, changed }
}

const parseLimit = (kind: Kind | undefined, pct: unknown, resets: unknown): Limit[] => {
  if (!kind || typeof pct !== 'number' || !Number.isFinite(pct)) return []
  const resetsAt = typeof resets === 'string' ? Date.parse(resets) : NaN
  return [{ kind, pct, resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt }]
}

export const fromHeaders = (ls: readonly SessionRateLimit[]): Limit[] =>
  ls.flatMap(l => parseLimit(isKind(l.kind) ? l.kind : undefined, l.percentUsed, l.resetsAt))

type EndpointLimit = { kind?: unknown; percent?: unknown; resets_at?: unknown } | null

export const fromEndpoint = (text: string): Limit[] => {
  const { limits } = (JSON.parse(text) ?? {}) as { limits?: unknown }
  return Array.isArray(limits)
    ? (limits as EndpointLimit[]).flatMap(l => parseLimit(ENDPOINT_KINDS.get(l?.kind), l?.percent, l?.resets_at))
    : []
}

let header: Reading | undefined
let endpoint: Reading | undefined
let fetchedAt = -Infinity
let git: Git | undefined
let shown: string | undefined
let tick: { cancel: () => void } | undefined

const readGit = async ($: EngineInterface) => {
  try {
    const r = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 10_000 })
    git = r.exitCode === 0 ? parseGit(r.stdout) : undefined
  } catch {}
}

const readEndpoint = async ($: EngineInterface, now: number) => {
  if (now - fetchedAt < 5 * MINUTE) return
  fetchedAt = now
  try {
    const auth = (await $.session.authorize())?.handle
    if (!auth) return
    const r = await $.http.fetch('https://api.anthropic.com/api/oauth/usage', {
      auth, headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
    if (r.ok) endpoint = { limits: fromEndpoint(r.text), at: await $.clock.now() }
  } catch {}
}

type Refresh = { git?: boolean; endpoint?: boolean; response?: boolean }

const refresh = async ($: EngineInterface, what: Refresh) => {
  try {
    const now = await $.clock.now()
    await Promise.all([what.git && readGit($), what.endpoint && readEndpoint($, now)])
    const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
    // headers read with no response behind them (a reload) date from before any fetch this process makes
    if (usage.rateLimits.length && (what.response || !header)) header = { limits: fromHeaders(usage.rateLimits), at: what.response ? now : -1 }
    const text = line({
      git, model, window: usage.context.window, ctx: usage.context.percent, limits: newest(header, endpoint)?.limits ?? [],
    }, await $.clock.now())
    if (text !== shown) $.ui.status(shown = text)
  } catch {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await refresh($, { git: true })
    tick?.cancel()
    tick = $.clock.every(30_000, () => void refresh($, { git: true, endpoint: true }))
    $.clock.after(1, () => void refresh($, { endpoint: true }))
    return r
  })
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    await refresh($, { response: true })
    return r
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refresh($, { git: true, response: true })
    return r
  })
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    await refresh($, {})
    return r
  })
}
