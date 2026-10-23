import type { EngineInterface } from 'claude-code'

// every meter's window, from one place: the account's usage endpoint, called with the host's own credential
export type Limit = {
  kind: 'five_hour' | 'seven_day' | 'model'
  // the model's display name, for a per-model weekly window
  name?: string
  percent: number
  resetsAt: number | null
}

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const STORED = 'limits'
export const REFRESH_EVERY = 5 * 60_000

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// the reset comes as an ISO string or as Unix seconds; either way it becomes epoch milliseconds
const resetMs = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  if (finite(value)) return value < 1e12 ? value * 1000 : value
  return null
}

type Raw = { kind?: unknown; percent?: unknown; resets_at?: unknown; scope?: { model?: { display_name?: unknown } } }

// text in, the windows out; a body that is not the expected shape gives none, so nothing is drawn from it
export const parseLimits = (text: string): Limit[] => {
  let body: { limits?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(body?.limits) ? (body.limits as Raw[]) : []
  return list.flatMap((l): Limit[] => {
    if (!finite(l.percent)) return []
    const resetsAt = resetMs(l.resets_at)
    if (l.kind === 'session') return [{ kind: 'five_hour', percent: l.percent, resetsAt }]
    if (l.kind === 'weekly_all') return [{ kind: 'seven_day', percent: l.percent, resetsAt }]
    const name = l.scope?.model?.display_name
    if (l.kind === 'weekly_scoped' && typeof name === 'string') return [{ kind: 'model', name, percent: l.percent, resetsAt }]
    return []
  })
}

// the windows the endpoint reports now, or null when there is nothing to draw from
export async function fetchLimits($: EngineInterface): Promise<Limit[] | null> {
  // the secret stays on the host: the plugin gets a handle and no credential
  const auth = await $.session.authorize()
  if (!auth) return null
  let text: string
  try {
    const r = await $.http.fetch(USAGE_URL, { auth: auth.handle })
    if (!r.ok) return null
    text = r.text
  } catch {
    return null
  }
  // an answer with no windows keeps what was drawn: a changed shape should not blank every meter
  const next = parseLimits(text)
  return next.length ? next : null
}
