import { test, expect, mock } from 'claude-code/testing'
import {
  band, paceBand, ctxBand, tokensText, shortDir, limitText, parseUsage, fresh, modelLabel, withModel,
  elapsed, countdown, bar, segments, desktopSegments, resetTime, usageRows, meter, desktopTier, DESKTOP_TIERS, buttonText, pill as desktopPill, layout, width, same, minuteKey, WINDOW_MS, WEEK,
  cacheTtl, cacheState, CACHE_MIN, icon, accuracyLine, usageAge,
} from './register'
import type { BarInput, Badge, CacheState, Run } from './register'
import type { Cache } from '../types'

test('bands, dir, labels, weekly parse', async () => {
  expect([49, 50, 79, 80].map(band)).toEqual([undefined, 'warn', 'warn', 'hot'])
  expect(shortDir('/home/me', '/home/me')).toBe('~')
  expect(shortDir('/home/me/.claude/skills', '/home/me')).toBe('skills')
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelLabel('gpt-x')).toBe('gpt-x')
  expect(modelLabel('claude-opus-5-5', 1_000_000)).toBe('Opus 5.5 1M') // the window from the reading
  expect(modelLabel('claude-haiku-4-5-20251001', 200_000)).toBe('Haiku 4.5 200K')
  expect(modelLabel('claude-opus-5-5[1m]', 1_000_000)).toBe('Opus 5.5 1M') // not 1M twice
  expect(limitText({ kind: 'five_hour', percentUsed: 1 })).toBe('5h')
  expect(limitText({ kind: 'mystery', percentUsed: 1 })).toBe('mystery')
  expect(parseUsage(JSON.stringify({ limits: [
    { kind: 'session', percent: 49, resets_at: '2026-10-02T15:20:00Z', scope: null },
    { kind: 'weekly_all', percent: 53, resets_at: '2026-10-06T12:00:00Z', scope: null },
    { kind: 'weekly_scoped', percent: 12, resets_at: '2026-10-07T00:00:00Z', scope: { model: { display_name: 'Fable' } } },
    { kind: 'weekly_scoped', percent: 9, scope: {} },
  ] }))).toEqual({
    limits: [
      { kind: 'five_hour', percentUsed: 49, resetsAt: '2026-10-02T15:20:00Z' },
      { kind: 'seven_day', percentUsed: 53, resetsAt: '2026-10-06T12:00:00Z' },
    ],
    weekly: [{ percent: 12, name: 'Fable', resetsAt: '2026-10-07T00:00:00Z' }],
  })
  const t = Date.parse('2026-10-03T00:00:00Z')
  expect(fresh([
    { kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-02T15:20:00Z' },
    { kind: 'seven_day', percentUsed: 53, resetsAt: '2026-10-06T12:00:00Z' },
    { kind: 'x', percentUsed: 1 },
  ], t).map(l => l.kind)).toEqual(['seven_day', 'x'])
})

test('row is always visible and fills in after a turn', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/.claude/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ limits: [
    { kind: 'weekly_scoped', percent: 85, scope: { model: { display_name: 'Fable' } } },
  ] }) } }))
  on('ui.render', async () => h('Box', {}) as never) // stands for the engine's own band
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.start', async (_$, e) => e as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('turn.complete', async () => ({ text: '' }))
  on('store.get', async () => ({ value: undefined })) // the 5-minute gate reads the store
  on('store.set', async () => ({ value: undefined }))

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const hasSurvey of [false, true]) {
      const ui = await $.ui.mount({
        plugin: 'session-bar', surface, component: 'AbovePrompt',
        props: { hasSurvey, isWorking: false, maxRows: 3 } as never,
      })
      // desktop shows the dir and model itself, so the mod leaves them out there
      const found = surface === 'terminal' ? 'toBeDefined' : 'toBeUndefined'
      expect(await ui.find({ type: 'Text', text: 'skills' }))[found]()
      expect(await ui.find({ type: 'Text', text: 'Opus 5.5' }))[found]()
      await ui.unmount()
    }
  }

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
  await $.session.measure({ context: { tokens: 187_400, window: 1_000_000, percent: 19 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23.4 }, { kind: 'seven_day', percentUsed: 61 }], changed: ['context', 'rateLimits'] } as never)
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never,
  })
  expect(await ui.find({ type: 'Text', text: 'ctx ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '187K' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · Opus 5.5 1M' })).toBeDefined() // window moved from ctx to the model
  expect(await ui.find({ type: 'Text', text: '23%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '61%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '85%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Fable ' })).toBeDefined()
  await ui.unmount()
})

test('fresh session draws stored limits before any turn; ctx fills from measure', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/.claude/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ deny: 'logged out' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.start', async (_$, e) => e as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  const stored: Record<string, unknown> = { limits: [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 41 }] }
  on('store.get', async (_$, e) => ({ value: stored[e.key] }))
  on('store.set', async () => ({ value: undefined }))

  await $.session.start({ source: 'startup', cwd: '/home/me/.claude/skills', surface: 'terminal', isInteractive: true } as never)
  const mount = () => $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never,
  })
  let ui = await mount()
  expect(await ui.find({ type: 'Text', text: '23%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '41%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ctx ' })).toBeUndefined()
  await ui.unmount()

  await $.session.measure({ context: { tokens: 187_400, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: 'ctx ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '187K' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '23%' })).toBeDefined() // empty reading keeps the last one
  await ui.unmount()
})

test('launch fetch fills 5h/7d with nothing stored and no turn', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/.claude/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ limits: [
    { kind: 'session', percent: 49, resets_at: '2099-01-01T00:00:00Z', scope: null },
    { kind: 'weekly_all', percent: 53, resets_at: '2099-01-01T00:00:00Z', scope: null },
    { kind: 'weekly_scoped', percent: 12, scope: { model: { display_name: 'Fable' } } },
  ] }) } }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.start', async (_$, e) => e as never)
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ value: undefined }))

  await $.session.start({ source: 'startup', cwd: '/home/me/.claude/skills', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never,
  })
  for (const text of ['5h ', '49%', '7d ', '53%', 'Fable ', '12%']) expect(await ui.find({ type: 'Text', text })).toBeDefined()
  await ui.unmount()
})

test('pace, countdown, bar', async () => {
  const now = Date.parse('2026-10-03T00:00:00Z')
  const at = (ms: number) => new Date(now + ms).toISOString()
  const H = 3_600_000
  expect(elapsed(at(5 * H), WINDOW_MS.five_hour!, now)).toBe(0)
  expect(elapsed(at(42 * H), WEEK, now)).toBe(0.75)
  expect(elapsed(at(-H), WINDOW_MS.five_hour!, now)).toBe(1)

  expect(paceBand(61, 0.8)).toBeUndefined() // high usage late in the week
  expect(paceBand(71, 0.3)).toBe('hot') // burning ahead of pace
  expect(paceBand(92, 0.95)).toBe('hot') // near the cap
  expect(paceBand(40, 0.2)).toBe('warn')
  expect(band(55)).toBe('warn') // no reset time, or context share

  expect(countdown(2 * H + 40 * 60_000)).toBe('2h40m')
  expect(countdown(31 * H + 20 * 60_000)).toBe('1d7h')
  expect(countdown(12 * 60_000)).toBe('12m')
  expect(countdown(30_000)).toBe('<1m')

  const line = (pct: number, cells?: number) => { const b = bar(pct, cells); return b.used + b.rest }
  expect(line(0)).toBe('──────────')
  expect(line(20)).toBe('━━────────') // one cell per 10%
  expect(line(25)).toBe('━━╾───────')
  expect(line(23.4)).toBe('━━╾───────')
  expect(line(100)).toBe('━━━━━━━━━━')
  expect(line(61, 5)).toBe('━━━──')
  expect(line(65, 5)).toBe('━━━╾─')
})

const NOW = Date.parse('2026-10-03T00:00:00Z')
const input = (over: Partial<BarInput> = {}): BarInput => ({
  dir: 'skills', model: 'Opus 5.5', ctx: { tokens: 120_000, window: 1_000_000 }, now: NOW,
  windows: [
    { label: '5h', pct: 23, resetsAt: new Date(NOW + 2 * 3_600_000 + 40 * 60_000).toISOString(), windowMs: WINDOW_MS.five_hour },
    { label: '7d', pct: 61, resetsAt: new Date(NOW + 31 * 3_600_000).toISOString(), windowMs: WEEK },
  ],
  ...over,
})
const texts = (runs: Run[]) => runs.map(r => r.text)
const pill = (runs: Run[], text: string) => runs.find(r => r.text === text)?.backgroundColor

test('context: tokens of the window, colored by tokens sent', async () => {
  const M = 1_000_000, K200 = 200_000
  expect([149_999, 150_000, 249_999, 250_000].map(tokens => ctxBand({ tokens, window: M })))
    .toEqual([undefined, 'warn', 'warn', 'hot'])
  expect([149_999, 150_000, 159_999, 160_000].map(tokens => ctxBand({ tokens, window: K200 })))
    .toEqual([undefined, 'warn', 'warn', 'hot']) // a 200K window caps only hot, at 80%
  expect([159_999, 160_000].map(tokens => ctxBand({ tokens, window: M, compactAt: 200_000 })))
    .toEqual(['warn', 'hot']) // a smaller auto-compact threshold caps hot at 80% of it, whatever the window
  expect([249_999, 250_000].map(tokens => ctxBand({ tokens, window: M, compactAt: 967_000 }))).toEqual(['warn', 'hot']) // a far one leaves 250K
  expect([187_400, 1_000_000, 200_000, 1_500_000].map(tokensText)).toEqual(['187K', '1M', '200K', '1.5M'])

  expect(pill(segments(input({ ctx: { tokens: 187_400, window: M } }), 0), '187K')).toBe('#E69F00') // past 150K
  expect(pill(segments(input({ ctx: { tokens: 120_000, window: M } }), 0), '120K')).toBeUndefined()
  expect(pill(segments(input({ ctx: { tokens: 180_000, window: M } }), 0), '180K')).toBe('#E69F00')
  expect(pill(segments(input({ ctx: { tokens: 170_000, window: K200 } }), 0), '170K')).toBe('#D55E00')
  expect(texts(segments(input({ ctx: undefined }), 0))).not.toContain('ctx ')
})

test('context bar runs to the hot threshold, warn tick matches the line weight', async () => {
  const M = 1_000_000
  // the ctx bar is the first run after the label, then its dimmed rest
  const ctxBar = (tokens: number, window = M, tier: 0 | 2 = 0) => {
    const runs = segments(input({ ctx: { tokens, window } }), tier)
    const i = runs.findIndex(r => r.text === 'ctx ')
    return [runs[i + 1]!, runs[i + 2]!]
  }
  const line = (...a: Parameters<typeof ctxBar>) => ctxBar(...a).map(r => r.text).join('')
  expect(line(120_000)).toBe('━━━━━─┼───') // below warn
  expect(line(187_400)).toBe('━━━━━━┿╾──') // past warn
  expect(line(160_000)).toBe('━━━━━━┽───') // fill ends on the tick's cell
  expect(line(260_000)).toBe('━━━━━━┿━━━') // past hot: clamped full
  expect(line(80_000, 200_000)).toBe('━━━━━────┼') // a 200K window runs to 160K
  expect(line(120_000, M, 2)).toBe('━━╾┼─') // short bars

  const [usedRun, restRun] = ctxBar(120_000)
  expect(restRun).toEqual({ text: '─┼───', dimColor: true }) // tick not reached: dimmed with the rest
  expect(usedRun!.dimColor).toBeUndefined()
  const [reached] = ctxBar(149_000, 200_000) // still calm, but the fill has reached the tick's cell
  expect(reached).toEqual({ text: '━━━━━━━━━┽' }) // drawn like the used part
})

test('tiers and layout', async () => {
  const b = input()
  const [full, noWeekly, short, noBars, bare] = ([0, 1, 2, 3, 4] as const).map(t => segments(b, t))
  expect(texts(full!)).toContain(' 2h40m')
  expect(texts(full!)).toContain(' 1d7h')
  expect(texts(noWeekly!)).toContain(' 2h40m') // the 5h reset stays
  expect(texts(noWeekly!)).not.toContain(' 1d7h')
  expect(texts(noWeekly!)).toContain('━━╾') // 5h at 23%
  expect(texts(short!)).toContain('━')
  expect(texts(noBars!).join('')).toBe('skills · Opus 5.5   ctx 120K   5h 23% 2h40m   7d 61%')
  expect(texts(bare!).join('')).toBe('skills · Opus 5.5   ctx 120K   5h 23%   7d 61%')

  expect(layout(b)).toEqual(full)
  expect(layout(b, width(full!))).toEqual(full)
  expect(layout(b, width(full!) - 1)).toEqual(noWeekly)
  expect(layout(b, width(short!))).toEqual(short)
  expect(layout(b, width(noBars!))).toEqual(noBars)
  expect(layout(b, width(noBars!) - 1)).toEqual(bare)
  expect(layout(b, 10)).toEqual(bare)
})

test('a subagent in view: type before its model, no ctx at any tier', async () => {
  const sub = input({ agent: 'Explore', model: 'Haiku 4.5', ctx: undefined })
  expect(texts(segments(sub, 3)).join('')).toBe('skills · Explore · Haiku 4.5   5h 23% 2h40m   7d 61%')
  expect(texts(segments(input({ agent: 'Plan', model: undefined, ctx: undefined }), 4)).join(''))
    .toBe('skills · Plan   5h 23%   7d 61%') // no model until its first request
  for (const tier of [0, 1, 2, 3, 4] as const) expect(texts(segments(sub, tier))).not.toContain('ctx ')
  expect(texts(layout(sub, 10)).join('')).toBe('skills · Explore · Haiku 4.5   5h 23%   7d 61%')
  expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5') // no window borrowed from main
})

test('agent models: recorded per id, unchanged map on a repeat or main', async () => {
  const ms = withModel({}, 'a1', 'claude-haiku-4-5-20251001')
  expect(ms).toEqual({ a1: 'claude-haiku-4-5-20251001' }) // new id
  expect(withModel(ms, 'a1', 'claude-haiku-4-5-20251001')).toBe(ms) // same model: no write
  expect(withModel(ms, 'a1', 'claude-sonnet-5-5')).toEqual({ a1: 'claude-sonnet-5-5' }) // a fallback moves it
  expect(withModel(ms, undefined, 'claude-opus-5-5')).toBe(ms) // main's step
})

test('band follows the transcript in view: spawn seeds the model, a step overrides it', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/.claude/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  on('agent.list', async () => ({ value: [{ id: 'a1', type: 'Explore', status: 'running' }, { id: 'a2', type: 'Plan', status: 'running' }] as never }))
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('turn.step', async function* (_$, e) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never })
  on('store.set', async () => ({ value: undefined }))

  await $.session.measure({ context: { tokens: 187_400, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 41 }], changed: ['context', 'rateLimits'] } as never)
  const mount = (agentId?: string) => $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, view: agentId ? { agentId } : {} } as never,
  })
  const step = async (agentId: string | undefined, model: string) => {
    for await (const _ of $.turn.step({ turnId: 't', index: 0, model, messageCount: 1, agentId })) { /* drain */ }
  }
  const sees = async (agentId: string | undefined, has: string[], hasNot: string[] = []) => {
    const ui = await mount(agentId)
    for (const text of has) expect(await ui.find({ type: 'Text', text })).toBeDefined()
    for (const text of hasNot) expect(await ui.find({ type: 'Text', text })).toBeUndefined()
    await ui.unmount()
  }

  await $.agent.spawn({ prompt: 'look', subagentType: 'Explore', parentModel: 'claude-opus-5-5' } as never)
  await sees('a1', [' · Explore', ' · Haiku 4.5', '41%'], ['ctx ', '187K', ' · Opus 5.5 1M']) // seeded by the spawn
  await step('a1', 'claude-sonnet-5-5')
  await sees('a1', [' · Sonnet 5.5'], [' · Haiku 4.5', ' · Sonnet 5.5 1M']) // a step overrides; no window from main
  await sees('a2', [' · Plan'], [' · Opus 5.5 1M', ' · Opus 5.5']) // no request yet: type alone
  await step(undefined, 'claude-fable-5-1') // main's step names no agent
  await sees(undefined, [' · Opus 5.5 1M', 'ctx ', '187K', '41%'], [' · Explore'])
})

test('calm segments are bare text; only attention gets a pill, all on its fill', async () => {
  const calm = segments(input(), 0)
  expect(calm.some(r => r.backgroundColor || r.color)).toBe(false) // terminal colors: any theme reads

  const hot = segments(input({ windows: [
    { label: '5h', pct: 71, resetsAt: new Date(NOW + 3.5 * 3_600_000).toISOString(), windowMs: WINDOW_MS.five_hour },
    { label: '7d', pct: 61, resetsAt: new Date(NOW + 31 * 3_600_000).toISOString(), windowMs: WEEK },
  ] }), 0)
  expect(pill(hot, '71%')).toBe('#D55E00')
  expect(pill(hot, '61%')).toBeUndefined()
  const start = hot.findIndex(r => r.text === ''), end = hot.findIndex(r => r.text === '')
  expect(hot.slice(start + 1, end).every(r => r.backgroundColor === '#D55E00' && r.color === '#191919')).toBe(true)
})

test('countdown moves while idle', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { limits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: new Date(NOW + 2 * 3_600_000 + 40 * 60_000).toISOString() }] })
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ deny: 'logged out' }))
  on('session.start', async (_$, e) => e as never)
  on('ui.render', async () => h('Box', {}) as never)

  await $.session.start({ source: 'startup', cwd: '/home/me/skills', surface: 'terminal', isInteractive: true } as never)
  const mount = () => $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never,
  })
  let ui = await mount()
  expect(await ui.find({ type: 'Text', text: ' 2h40m' })).toBeDefined()
  await ui.unmount()
  await clock.advance(3 * 60_000)
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: ' 2h37m' })).toBeDefined()
  await ui.unmount()
})

test('branch shows after the dir, only when given', () => {
  expect(texts(segments(input({ branch: 'main' }), 0)).slice(0, 3)).toEqual(['skills', ' (main)', ' · Opus 5.5'])
  expect(texts(segments(input(), 0))).not.toContain(' (main)')
})

test('desktop: every reading shows as a pill, calm ones neutral', () => {
  const calm = desktopSegments(input()) // dir, branch and model stay with the app
  expect(calm.map(b => [b.kind, b.level])).toEqual([['ctx', undefined], ['5h', undefined], ['7d', undefined]])
  expect(desktopSegments(input({ ctx: undefined, windows: [] }))).toEqual([]) // no reading, no pill
  const win = (label: string, pct: number, hours: number, windowMs: number) =>
    ({ label, pct, resetsAt: new Date(NOW + hours * 3_600_000).toISOString(), windowMs })
  const hot = desktopSegments(input({ windows: [win('5h', 71, 3.5, WINDOW_MS.five_hour!), win('7d', 61, 31, WEEK)] }))
  expect(hot.map(b => [b.kind, b.label, b.value, b.level])).toEqual([
    ['ctx', undefined, '120K', undefined], // ctx: no label, calm but shown
    ['5h', '5h', '71%', 'hot'], // no countdown on any pill
    ['7d', '7d', '61%', undefined],
  ])
  const kinds = desktopSegments(input({ windows: [win('5h', 71, 3.5, WINDOW_MS.five_hour!), win('Sonnet', 10, 31, WEEK)] }))
  expect(kinds.map(b => b.kind)).toEqual(['ctx', '5h', 'model'])
  const ctx = (tokens: number) => desktopSegments(input({ ctx: { tokens, window: 1_000_000 } }))[0]!
  expect(ctx(187_400)).toMatchObject({ value: '187K', share: (187_400 / 250_000) * 100, level: 'warn' }) // ring runs to the hot threshold
  expect(ctx(260_000)).toMatchObject({ value: '260K', share: 100, level: 'hot' }) // clamped at full
  expect(desktopSegments(input({ ctx: undefined, windows: [{ label: '5h', pct: 55 }] })).map(b => b.value)).toEqual(['55%']) // no ctx reading, no ctx pill
})

test('desktop hover text names the segment, its value, reset and pace', () => {
  const at = (pct: number, hours: number) => desktopSegments(input({ ctx: { tokens: 260_000, window: 1_000_000 }, windows: [ // a hot ctx so the pills show at all
    { label: '5h', pct, resetsAt: new Date(NOW + hours * 3_600_000).toISOString(), windowMs: WINDOW_MS.five_hour },
    { label: 'Fable', pct: 65, resetsAt: new Date(NOW + 31 * 3_600_000).toISOString(), windowMs: WEEK },
  ] }))
  expect(at(15, 4.2)[1]!.tip).toBe('Session limit: 15% used · resets in 4h12m · on pace')
  expect(at(71, 3.5)[1]!.tip).toBe('Session limit: 71% used · resets in 3h30m · ahead of pace')
  expect(at(71, 3.5)[2]!.tip).toBe('Weekly, Fable: 65% used · resets in 1d7h · on pace')
  expect(desktopSegments(input({ windows: [], ctx: { tokens: 213_000, window: 1_000_000 } }))[0]!.tip).toBe('Context: 213K of 1M tokens')
})

test('pill: fill is the share used, icon per kind, tint by level, neutral when calm, title for hover', () => {
  const b: Badge = { kind: 'ctx', value: '85%', share: 100, level: 'warn', tip: 'a & b <c>' }
  const src = (o: Partial<Badge> = {}) => desktopPill({ ...b, ...o }).source
  const fillW = (o: Partial<Badge>) => {
    const p = desktopPill({ ...b, ...o })
    return { w: +/<rect width="([\d.]+)"/.exec(p.source)![1]!, total: p.width }
  }
  const half = fillW({ share: 50 })
  expect(Math.abs(half.w - half.total / 2)).toBeLessThan(0.01) // the left half of the pill is filled
  expect(fillW({ share: 100 }).w).toBe(fillW({ share: 100 }).total)
  expect(fillW({ share: 0 }).w).toBe(0)
  // color means severity only: a translucent track and meter fill in the status color, gray when calm
  // warn: amber fill, red when hot, each at a per-scheme opacity so the ink stays 4.5:1 on fill and track alike
  expect(src()).toContain('fill="#fab219" class="sb-fwarn"')
  expect(src({ level: 'hot' })).toContain('fill="#d03b3b" class="sb-fhot"')
  expect(src()).toContain('.sb-fwarn{fill-opacity:.8}.sb-fhot{fill-opacity:.55}') // light: dark ink
  expect(src()).toContain('.sb-fwarn{fill-opacity:.25}.sb-fhot{fill-opacity:.85}.sb-f5h{fill-opacity:.6}') // dark: light ink; the calm blue firmer
  expect(desktopPill({ ...b, label: '5h', level: 'hot' }).source).toContain('<tspan class="sb-i">5h</tspan>') // no dim label on red
  expect(desktopPill({ ...b, label: '5h', level: undefined }).source).toContain('<tspan class="sb-d">5h</tspan>')
  expect(src()).toContain('.sb-d{fill:#555550}') // the dim label: 4.5:1 on a calm hue, light and dark
  expect(src({ level: 'hot' })).toContain('class="sb-b"') // the mockup's neutral hairline, not the status color
  expect(src({ level: 'hot' })).not.toContain('stroke="#d03b3b"')
  const calm = src({ level: undefined })
  expect(calm).toContain('fill="rgb(127,127,127)" fill-opacity="0.3"')
  expect(calm).toContain('class="sb-t sb-b"') // calm track: a white chip, fainter in dark, the same hairline
  expect(calm).toContain('.sb-t{fill-opacity:.07}')
  expect(src()).not.toContain('class="sb-t') // an attention track is the status color
  expect(calm).not.toContain('#fab219')
  expect(calm).toContain('prefers-color-scheme:dark') // ink follows the scheme
  expect(src()).toContain('<title>a &amp; b &lt;c></title>') // escaped
  const kinds = ['ctx', '5h', '7d', 'model'] as const
  const paths = kinds.map(kind => /<g [^>]*>(.*?)<\/g>/.exec(src({ kind }))![1])
  expect(new Set(paths).size).toBe(4) // four different icons
  expect(calm).toContain('stroke-width="2.4"') // 1.5px on screen at 15/24 scale
  expect(calm).toMatch(/<text x="30" y="16.5" font-size="12"/) // 10px side, 15px icon, 5px gap; 12px text
  const colors = (s: string) => s.match(/#[0-9a-f]{6}/gi)!.filter(c => !['#1f1f1e', '#555550', '#f0efe9', '#bdbcb4'].includes(c))
  expect(kinds.map(kind => [...new Set(colors(src({ kind, level: undefined })))])).toEqual([[], ['#0072B2'], ['#2c8e68'], ['#CC79A7']]) // a calm quota's own hue; calm ctx stays gray
  expect(kinds.map(kind => [...new Set(colors(src({ kind, level: 'hot' })))])).toEqual(kinds.map(() => ['#d03b3b'])) // attention replaces it
  expect(calm).toContain('class="sb-p"') // the mockup's icon is the primary ink, calm or not
  expect(src()).toContain('class="sb-p"')
  const wide = desktopPill({ ...b, label: '5h', value: '15%', share: 15, level: undefined, tip: '' })
  expect(wide.width).toBeGreaterThan(desktopPill({ ...b, value: '15%', share: 15, level: undefined, tip: '' }).width) // the label widens it
  expect(src()).not.toContain('>ctx') // no label text on the context pill
})

test('desktop mount: calm draws nothing of ours and spawns no git; attention is a ring badge; a subagent drops ctx', async ($, on) => {
  let spawns = 0
  on('session.root', async () => ({ value: '/home/me/.claude/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('process.run', async () => { spawns++; return { value: { exitCode: 0, stdout: 'main\n', stderr: '' } } as never })
  on('ui.render', async () => h('Box', {}) as never)
  on('agent.list', async () => ({ value: [{ id: 'a1', type: 'Explore', status: 'running' }] as never }))
  on('store.set', async () => ({ value: undefined }))
  const pills = async (agentId?: string) => {
    const ui = await $.ui.mount({
      plugin: 'session-bar', surface: 'desktop', component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 3, view: agentId ? { agentId } : {} } as never,
    })
    const n = (await ui.findAll({ type: 'Svg' })).length
    // dir, branch and model are Text on the terminal; the only Text here is each pill's hover card, its alt text
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => !/^(Context|Session limit):/.test(t))
    await ui.unmount()
    return { n, text }
  }

  await $.session.measure({ context: { tokens: 50_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], changed: ['context', 'rateLimits'] } as never)
  expect(await pills()).toEqual({ n: 2, text: [] }) // calm: neutral ctx and 5h pills, still no dir, branch or model
  await $.session.measure({ context: { tokens: 187_400, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 71 }], changed: ['context', 'rateLimits'] } as never)
  expect(await pills()).toEqual({ n: 2, text: [] }) // ctx and 5h pills, no dir, branch or model text
  expect((await pills('a1')).n).toBe(1) // a subagent in view: the 5h pill only, no ctx
  expect(spawns).toBe(0)

  // an interactive Svg is rebuilt on every redraw and flickered the bar, even with one, so no pill has hover
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, view: {} } as never,
  })
  const svgs = (await ui.findAll({ type: 'Svg' })).map(s => s.props as { alt: string, isInteractive?: boolean })
  await ui.unmount()
  expect(svgs.map(s => [s.alt.split(':')[0], !!s.isInteractive])).toEqual([['Session limit', false], ['Context', false]])
})

test('an unchanged reading is not written, so it does not redraw', async ($, on) => {
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('store.set', async () => ({ value: undefined }))
  const writes: string[] = []
  on('state.set', async (_$, e, next) => { writes.push((e as { key: string }).key); return next(e) })
  const measure = (tokens: number, pct: number) => $.session.measure({
    context: { tokens, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: pct }], changed: ['context', 'rateLimits'],
  } as never)

  await measure(100_000, 20)
  expect(writes.sort()).toEqual(['ctx', 'limits']) // the first reading writes both
  writes.length = 0
  await measure(100_000, 20) // the same again
  expect(writes).toEqual([])
  await measure(100_001, 20) // only the context moved
  expect(writes).toEqual(['ctx'])
  writes.length = 0
  await measure(100_001, 21) // only the window moved
  expect(writes).toEqual(['limits'])
})

test('a usage fetch writes no state when nothing changed, and the 5-minute gate holds', async ($, on) => {
  let fetches = 0, now = 1e12
  const kept: Record<string, unknown> = {}
  const writes: string[] = []
  on('session.authorize', async () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', async () => { fetches++; return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ limits: [
    { kind: 'session', percent: 49, resets_at: '2099-01-01T00:00:00Z', scope: null },
  ] }) } } })
  on('clock.now', async () => ({ value: now }))
  on('session.start', async (_$, e) => e as never)
  on('clock.every', async () => ({ value: undefined }) as never)
  on('turn.complete', async () => ({ text: '' }))
  on('store.get', async (_$, e) => ({ value: kept[(e as { key: string }).key] }))
  on('store.set', async (_$, e) => { kept[(e as { key: string }).key] = (e as { value: unknown }).value; return { value: undefined } })
  on('state.set', async (_$, e, next) => { writes.push((e as { key: string }).key); return next(e) })
  const turn = () => $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })

  await turn() // nothing stored: fetches, and the new limits are a real change
  expect(fetches).toBe(1)
  expect(writes).toEqual(['limits'])
  writes.length = 0
  now += 60_000
  await turn() // inside the window: no fetch
  expect(fetches).toBe(1)
  now += 300_000
  await turn() // window passed: fetches, same limits, so no write at all
  expect(fetches).toBe(2)
  expect(writes).toEqual([])
})

test('a minute tick is only worth a redraw when something on screen moved', () => {
  expect(same({ a: [1] }, { a: [1] })).toBe(true)
  expect(same([{ k: 1 }], [{ k: 2 }])).toBe(false)
  const win = (pct: number, ms: number) => [{ label: '5h', pct, resetsAt: new Date(NOW + ms).toISOString(), windowMs: WINDOW_MS.five_hour! }]
  const left = 2 * 3_600_000 + 40 * 60_000 + 30_000 // 2h40m30s: countdown() floors to minutes
  const key = (ms: number, at = NOW) => minuteKey(win(23, ms), at)
  expect(key(left)).toBe(key(left, NOW + 20_000)) // 20s later: still 2h40m, nothing to redraw
  expect(key(left)).not.toBe(key(left, NOW + 60_000)) // a minute later: the countdown moved
  expect(minuteKey([], NOW)).toBe(minuteKey([], NOW + 60_000)) // no windows: nothing ever moves
})

test('Desktop draws no countdown, so a minute that only moves one is not a redraw', () => {
  const win = (pct: number, ms: number) => [{ label: '5h', pct, resetsAt: new Date(NOW + ms).toISOString(), windowMs: WINDOW_MS.five_hour! }]
  const left = 2 * 3_600_000 + 40 * 60_000 + 30_000
  const key = (at: number, countdowns: boolean, pct = 23) => minuteKey(win(pct, left), at, countdowns)
  expect(key(NOW, false)).toBe(key(NOW + 60_000, false)) // countdown moved, nothing drawn changed
  expect(key(NOW, true)).not.toBe(key(NOW + 60_000, true)) // the terminal draws it
  expect(key(NOW, false, 23)).not.toBe(key(NOW, false, 90)) // a pace band moving still counts
})

test('usage button: on Desktop only, expands and collapses the block above the pills', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/.claude/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('process.run', async () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }) as never)
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: undefined })) // the open block reads when the usage was fetched
  on('store.set', async () => ({ value: undefined }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  const mount = (surface: 'desktop' | 'terminal') => $.ui.mount({
    plugin: 'session-bar', surface, component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, view: {} } as never,
  })
  const seen = async (ui: Awaited<ReturnType<typeof mount>>) => ({
    buttons: (await ui.findAll({ type: 'Button' })).map(b => [b.key, (b.props as { label?: string }).label]),
    alts: (await ui.findAll({ type: 'Svg' })).map(s => (s.props as { alt: string }).alt),
  })

  // no reading yet: no pills, so no button
  let ui = await mount('desktop')
  expect((await seen(ui)).buttons).toEqual([])
  await ui.unmount()

  await $.session.measure({ context: { tokens: 50_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], changed: ['context', 'rateLimits'] } as never)
  ui = await mount('terminal')
  expect((await seen(ui)).buttons).toEqual([]) // the terminal bar is unchanged
  expect(await ui.find({ text: 'Session limit' })).toBeUndefined()
  await ui.unmount()

  ui = await mount('desktop')
  const collapsed = { buttons: [['usage', 'Usage details']], alts: [expect.stringMatching(/^Session limit:/), expect.stringMatching(/^Context:/)] }
  expect(await seen(ui)).toEqual(collapsed) // calm: pills and the button, block collapsed
  await ui.press({ key: 'usage' })
  expect(await seen(ui)).toEqual({ ...collapsed, alts: ['context pill', 'Context: 50K', '5h pill', 'Session limit: 20%', ...collapsed.alts] }) // each row's icon and meter, then the pills
  expect(await ui.find({ text: 'Ideal under 150K · window 1M' })).toBeDefined()
  expect(await ui.find({ text: '5h' })).toBeUndefined() // the pills' labels are in their Svg, not renamed Text
  await ui.press({ key: 'usage' })
  expect(await seen(ui)).toEqual(collapsed)
  await ui.press({ key: 'usage' })
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'person' } } as never)
  expect(await seen(ui)).toEqual(collapsed) // sending a prompt collapses it
  await ui.unmount()
})

test('usage block: two rows a line when wide, one compact row a line when narrow, same content', async ($, on) => {
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.root', async () => ({ value: '/home/me' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ value: undefined }))
  await $.session.measure({ context: { tokens: 50_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }, { kind: 'seven_day', percentUsed: 40 }], changed: ['context', 'rateLimits'] } as never)
  const draw = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 9, bodyColumns, view: {} } as never })
    await ui.press({ key: 'usage' })
    const svgs = (await ui.findAll({ type: 'Svg' })).map(s => s.props as { alt: string; source: string })
    // each row's icon is its pill's, the same <g> (shape, size, stroke) but for where it sits and its ink: the rows' is the
    // mockup's accent blue, the pills' the primary ink
    const g = (s: string) => s.match(/<g [^>]*>.*?<\/g>/)![0].replace(/translate\([^)]*\)/, '').replace(/class="sb-[pa]"/, '')
    const pills = svgs.filter(s => s.source.includes('<title>')).map(s => g(s.source))
    const icons = svgs.filter(s => s.alt.endsWith(' pill'))
    expect(icons.map(s => s.alt)).toEqual(['context pill', '5h pill', '7d pill'])
    expect(icons.every(s => s.source.includes('class="sb-a"') && s.source.includes('.sb-a{stroke:#084f95}'))).toBe(true)
    expect([...icons.map(s => g(s.source))].sort()).toEqual([...pills].sort())
    const out = {
      meters: svgs.map(s => s.alt).filter(alt => /^[^:]+: [\d.]+[%K]$/.test(alt)),
      texts: await Promise.all(['Context', '50K', 'Session limit', '20%', 'Weekly · all models', '40%', 'Ideal under 150K · window 1M'].map(async text => !!(await ui.find({ text })))),
    }
    await ui.press({ key: 'usage' }) // the open state is the session's: close it for the next mount
    await ui.unmount()
    return out
  }
  const wide = await draw(120), narrow = await draw(55), compact = await draw(44)
  expect(wide).toEqual({ meters: ['Context: 50K', 'Session limit: 20%', 'Weekly · all models: 40%'], texts: [true, true, true, true, true, true, true] })
  expect(narrow).toEqual(wide) // the compact rows keep every name, value, meter and line
  expect(compact).toEqual(wide) // and the icon button still opens it
})

test('usage meter: fill is the share, a pale shadow behind it for the time gone, no tick, sized by its cell', () => {
  const r = { kind: '5h', name: 'x', value: '25%', share: 25, shadow: 77, level: undefined, line: '' } as const
  const m = meter(r)
  expect(m).toContain('width="25%" height="6" clip-path="url(#sb-c-meter-x)" fill="#0072B2"/>') // fill: a quarter, solid in the 5h hue, as the mockup
  expect(m).toContain('width="77%" height="6" clip-path="url(#sb-c-meter-x)" class="sb-k"') // shadow: 77%
  expect(m.indexOf('class="sb-k"/>')).toBeLessThan(m.indexOf('fill="#0072B2"')) // drawn behind the fill
  expect(m).not.toContain('stroke') // a plain gray track, no outline
  expect(m).toContain('<rect x="25%" width="2" height="6" clip-path="url(#sb-c-meter-x)" class="sb-g"/>') // a 2px gap where fill meets shadow
  expect(m.indexOf('class="sb-g"')).toBeGreaterThan(m.indexOf('fill="#0072B2"')) // over the fill's end
  expect(meter({ ...r, shadow: 10 })).not.toContain('class="sb-g"') // a shadow under the fill shows no edge to mark
  expect(meter({ ...r, share: 0 })).not.toContain('class="sb-g"')
  expect(m).not.toContain('viewBox') // no fixed coordinate width to stretch: the flex cell sets it
  expect(m).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100%"')
  expect(meter({ ...r, level: 'hot' })).toContain('fill="#d03b3b"') // the pill's hot color
  expect(meter({ ...r, shadow: undefined })).not.toContain('class="sb-k"/>') // no shadow without a clock
})

test('desktop tiers: one row that sheds labels, then the button name, then icons, to fit', () => {
  const b = (kind: Badge['kind'], value: string, label?: string): Badge => ({ kind, label, value, share: 1, level: undefined, tip: '' })
  const badges = [b('5h', '1%', '5h'), b('7d', '79%', '7d'), b('model', '65%', 'Fable'), b('ctx', '285K')]
  const at = (columns?: number) => DESKTOP_TIERS.indexOf(desktopTier(badges, columns))
  expect(at()).toBe(0) // no width known: everything
  expect(at(161)).toBe(0) // Desktop's widest transcript setting, read live
  expect(at(95)).toBe(0) // its default width
  expect(at(55)).toBe(1) // the narrow transcript width drops the labels and keeps the icons, as seen live
  expect(at(44)).toBe(2) // a narrow window: the button down to arrows, and the icons kept, so warnings stay apart
  expect(at(33)).toBe(3) // the narrowest window read live: values only
  expect(DESKTOP_TIERS.map(t => t.icon)).toEqual([true, true, true, false]) // icons go last
  expect(buttonText(DESKTOP_TIERS[2]!)).toBe('⤢') // compact: one arrows-out glyph
  expect(buttonText(DESKTOP_TIERS[1]!)).toBe('Usage details')
  expect(at(10)).toBe(DESKTOP_TIERS.length - 1) // nothing fits: the barest
  const tiers = [95, 80, 70, 60, 55, 45, 33].map(at)
  expect(tiers).toEqual([...tiers].sort()) // narrower never gets richer

  const full = desktopPill(badges[0]!), bare = desktopPill(badges[0]!, { label: false, icon: false })
  expect(full.source).toContain('<tspan class="sb-d">5h</tspan><tspan dx="5" class="sb-i">1%</tspan>') // 5px between label and value
  expect(full.source).toContain('<g ')
  expect(bare.source).not.toContain('>5h</tspan>') // no label
  expect(bare.source).toContain('<tspan class="sb-i">1%</tspan>') // and no gap before the value
  expect(bare.source).not.toContain('<g ') // no icon
  expect(bare.width).toBeLessThan(desktopPill(badges[0]!, { label: false, icon: true }).width)
  expect(desktopPill(badges[0]!, { label: false, icon: true }).width).toBeLessThan(full.width)
})

test('every Svg keeps its classes and clip id to itself, so markup placed in the app page clashes with nothing', () => {
  const badge = (kind: Badge['kind'], label?: string): Badge => ({ kind, label, value: '1%', share: 1, level: undefined, tip: '' })
  const sources = [
    ...[badge('ctx'), badge('5h', '5h'), badge('7d', '7d'), badge('model', 'Fable')].map(b => desktopPill(b).source),
    ...['Context', 'Session limit', 'Weekly · all models', 'Weekly · Fable'].map(name => meter({ kind: 'ctx', name, value: '', share: 1, level: undefined, line: '' })),
  ]
  const ids = sources.map(s => /id="([^"]+)"/.exec(s)![1])
  expect(new Set(ids).size).toBe(sources.length) // one clip id per Svg
  for (const s of sources) {
    expect([...s.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1]!.split(' ')).every(c => c.startsWith('sb-'))).toBe(true)
    expect(s).toContain(`clip-path="url(#${/id="([^"]+)"/.exec(s)![1]})"`) // each fill uses its own clip
  }
  expect(desktopPill(badge('5h', '5h')).source).toContain('font-size="12"') // label and value one size, as the mockup, at regular weight
  expect(desktopPill(badge('5h', '5h')).source).not.toContain('font-weight')
  expect(icon('').includes('class=') && [...icon('').matchAll(/class="([^"]+)"/g)].every(m => m[1]!.startsWith('sb-'))).toBe(true)
})

test('usage rows: app names, pace line, cap time, reset; context against the ideal ceiling', () => {
  const now = new Date(2026, 9, 12, 15, 26).getTime() // local time, so the test holds in any zone
  const H = 3_600_000
  const win = (label: string, pct: number, leftMs: number, windowMs = WINDOW_MS.five_hour!) =>
    ({ label, pct, resetsAt: new Date(now + leftMs).toISOString(), windowMs })
  const rows = (windows: BarInput['windows'], ctx?: BarInput['ctx']) => usageRows(input({ now, ctx, windows }))

  expect(rows([win('5h', 20, 4 * H), win('7d', 50, 100 * H, WEEK), win('Fable', 10, 100 * H, WEEK)]).map(r => [r.kind, r.name]))
    .toEqual([['5h', 'Session limit'], ['7d', 'Weekly · all models'], ['model', 'Weekly · Fable']])

  const room = rows([win('5h', 25, 1 * H)])[0]!
  expect(room).toMatchObject({ value: '25%', share: 25, shadow: 80, level: undefined, line: 'Room to use more · resets in 1h' })
  const weekly = rows([{ label: '7d', pct: 78, resetsAt: new Date(2026, 9, 13, 17, 30).toISOString(), windowMs: WEEK }])[0]!
  expect(weekly.line).toBe('On pace · resets Tue 17:30') // over a day left: weekday and time; 2026-10-13 is a Tuesday
  const shadowed = rows([win('7d', 25, 0.23 * WEEK, WEEK)])[0]!
  expect([shadowed.share, Math.round(shadowed.shadow!)]).toEqual([25, 77]) // the shadow shows past the fill

  const ahead = rows([win('5h', 71, 3.5 * H)])[0]!
  expect(ahead).toMatchObject({ level: 'hot', line: 'Ahead of pace · hits the cap in about 37m' }) // 29/71 of 1h30m
  expect(rows([win('5h', 25, 0.95 * 5 * H)])[0]!.line).toBe('Ahead of pace') // 5% gone: too early for a cap time

  const bare = rows([{ label: '5h', pct: 55 }])[0]! // no reset time: no shadow, no line
  expect(bare).toMatchObject({ value: '55%', line: '', level: 'warn' })
  expect(bare.shadow).toBeUndefined()

  const M = 1_000_000
  const calm = rows([], { tokens: 120_000, window: M })[0]!
  expect(calm).toMatchObject({ kind: 'ctx', name: 'Context', value: '120K', line: 'Ideal under 150K · window 1M' })
  expect(calm.shadow).toBeUndefined() // context has no clock
  const warm = rows([], { tokens: 187_400, window: M })[0]!
  expect(warm).toMatchObject({ level: 'warn', line: 'Past the ideal range · window 1M' })
  expect(Math.round(warm.share)).toBe(75) // nearly three quarters of the scale to 250K
  expect(rows([], { tokens: 170_000, window: 200_000 })[0]).toMatchObject({ level: 'hot', line: 'Past 160K, quality drops · window 200K' })
  // the compaction point moves the ceiling, and nothing is said about it: the person wants the texts as they were
  expect(rows([], { tokens: 140_000, window: 200_000, compactAt: 167_000 })[0]).toMatchObject({ level: 'hot', line: 'Past 134K, quality drops · window 200K' })
  expect(rows([], { tokens: 120_000, window: M, compactAt: 967_000 })[0]).toMatchObject({ line: 'Ideal under 150K · window 1M' })
  expect(calm.more).toBeUndefined()
  expect(usageRows(input({ ctx: undefined, windows: [] }))).toEqual([])
})

test('Desktop: a minute that moves only a countdown redraws while the block is open, not while collapsed', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { limits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: new Date(NOW + 2 * 3_600_000 + 40 * 60_000 + 30_000).toISOString() }] })
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ deny: 'logged out' }))
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('session.start', async (_$, e) => e as never)
  on('ui.render', async () => h('Box', {}) as never)
  let ticks = 0
  on('state.set', async (_$, e, next) => { if ((e as { key: string }).key === 'tick') ticks++; return next(e) })

  await $.session.start({ source: 'startup', cwd: '/home/me/skills', surface: 'desktop', isInteractive: true } as never)
  await clock.advance(60_000) // the first tick records what is on screen
  const base = ticks
  await clock.advance(60_000)
  expect(ticks).toBe(base) // collapsed: Desktop draws no countdown
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, view: {} } as never,
  })
  await ui.press({ key: 'usage' })
  await clock.advance(60_000)
  expect(ticks).toBe(base + 1) // open: its `resets in` line moved
  await ui.unmount()
})

test('reset time: a clock time today, a weekday and clock time on another day', () => {
  const now = new Date(2026, 9, 12, 15, 26).getTime() // local time, so the test holds in any zone
  const at = (...t: [number, number, number, number, number]) => new Date(...t).toISOString()
  expect(resetTime(at(2026, 9, 12, 18, 40), now)).toBe('18:40')
  expect(resetTime(at(2026, 9, 12, 9, 5), now)).toBe('09:05') // zero-padded
  expect(resetTime(at(2026, 9, 13, 17, 30), now)).toBe('Tue 17:30') // 2026-10-13 is a Tuesday
})

const MIN = 60_000
// a transcript assistant line: the request's counts and what its response wrote to the cache
const usageLine = (cache_creation: object, read = 400_000, input = 12_000) =>
  JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: input, cache_read_input_tokens: read, cache_creation } } })
const READ = 400_000, INPUT = 12_000

test('cache TTL: the newest line with the step\'s counts; 1h only when nothing took 5m, either key order, a cut first line; no match or nothing written keeps the last', () => {
  expect(cacheTtl(usageLine({ ephemeral_1h_input_tokens: 1457, ephemeral_5m_input_tokens: 0 }), READ, INPUT)).toBe(60 * MIN)
  expect(cacheTtl(usageLine({ ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1457 }), READ, INPUT)).toBe(60 * MIN)
  expect(cacheTtl(usageLine({ ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 12 }), READ, INPUT)).toBe(5 * MIN) // mixed: 5m goes first
  expect(cacheTtl(usageLine({ ephemeral_5m_input_tokens: 300 }), READ, INPUT)).toBe(5 * MIN)
  const tail = ['_input_tokens":1}}}', usageLine({ ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 0 }), '{"type":"user"}', ''].join('\n')
  expect(cacheTtl(tail, READ, INPUT)).toBe(5 * MIN) // the cut line and a line with no usage are skipped
  // the previous step's line is still the newest (the engine writes this step's about 100 ms later): no answer, the last TTL stands
  expect(cacheTtl(usageLine({ ephemeral_5m_input_tokens: 300 }, 380_000, 9_000), READ, INPUT)).toBeUndefined()
  const older = [usageLine({ ephemeral_1h_input_tokens: 50, ephemeral_5m_input_tokens: 0 }), usageLine({ ephemeral_5m_input_tokens: 300 }, 380_000, 9_000)].join('\n')
  expect(cacheTtl(older, READ, INPUT)).toBe(60 * MIN) // the match is the older line
  expect(cacheTtl(usageLine({ ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 }), READ, INPUT)).toBeUndefined() // matched, wrote nothing: keep the last
  expect(cacheTtl('{"type":"user"}\nnot json', READ, INPUT)).toBeUndefined()
  expect(cacheTtl('', READ, INPUT)).toBeUndefined()
})

test('cache state: counted from the last main request; soon under 5 minutes, cold past the TTL, in flight while one streams; none below 100K, before a request or without a TTL', () => {
  const sent = (ago: number, ttlMs = 60 * MIN): Cache => ({ sentAt: NOW - ago, inFlight: false, ttlMs })
  expect(cacheState(sent(22 * MIN), 412_000, NOW)).toEqual({ state: 'warm', left: 38 * MIN })
  expect(cacheState(sent(56 * MIN), 412_000, NOW)).toEqual({ state: 'soon', left: 4 * MIN })
  expect(cacheState(sent(61 * MIN), 412_000, NOW)).toEqual({ state: 'cold', left: 0 })
  expect(cacheState(sent(7 * MIN, 5 * MIN), 412_000, NOW)).toEqual({ state: 'cold', left: 0 }) // a tool of the turn still runs: idle for the cache
  expect(cacheState(sent(20 * MIN), 412_000, NOW)).toEqual({ state: 'warm', left: 40 * MIN }) // a permission dialog left open: the same
  expect(cacheState({ ...sent(0), inFlight: true }, 412_000, NOW)).toEqual({ state: 'active', left: 60 * MIN }) // a request streams
  expect(cacheState({ ...sent(3 * MIN), inFlight: true, cold: true }, 412_000, NOW)).toEqual({ state: 'cold', left: 0 }) // it named another model
  expect(cacheState(sent(22 * MIN), 45_000, NOW)).toBeUndefined()
  expect(cacheState(sent(22 * MIN), CACHE_MIN, NOW)?.state).toBe('warm')
  expect(cacheState(null, 412_000, NOW)).toBeUndefined() // no request yet
  expect(cacheState({ sentAt: NOW, inFlight: true }, 412_000, NOW)).toBeUndefined() // TTL unknown: the first request's line is not read yet
  expect(cacheState(sent(22 * MIN), undefined, NOW)).toBeUndefined()
})

test('cache in the terminal bar: dim countdown, orange when soon, dim cold, a bare symbol at the narrowest tier', () => {
  const ctx = { tokens: 120_000, window: 1_000_000 } // calm, so the runs keep their own colors (a pill paints its own)
  const run = (cache: CacheState, tier: 0 | 4 = 0) => segments(input({ ctx, cache }), tier).find(r => r.text.startsWith(' ❄'))
  expect(run({ state: 'warm', left: 38 * MIN })).toEqual({ text: ' ❄ 38m', dimColor: true })
  expect(run({ state: 'soon', left: 4 * MIN })).toEqual({ text: ' ❄ 4m', color: '#E69F00' })
  expect(run({ state: 'cold', left: 0 })).toEqual({ text: ' ❄ cold', dimColor: true })
  expect(run({ state: 'warm', left: 38 * MIN }, 4)).toEqual({ text: ' ❄', dimColor: true })
  expect(run({ state: 'cold', left: 0 }, 4)?.text).toBe(' ❄ cold')
  expect(run({ state: 'active', left: 60 * MIN })).toEqual({ text: ' ❄ in use', dimColor: true })
  expect(run({ state: 'active', left: 60 * MIN }, 4)?.text).toBe(' ❄')
  expect(texts(segments(input({ ctx }), 0)).join('')).not.toContain('❄') // no state, nothing added
  // it comes after the token count, inside the ctx segment
  const all = texts(segments(input({ ctx, cache: { state: 'warm', left: 38 * MIN } }), 0))
  expect(all.indexOf(' ❄ 38m')).toBe(all.indexOf('120K') + 1)
  expect(width(layout(input({ ctx, cache: { state: 'warm', left: 38 * MIN } }), 40))).toBeGreaterThan(0)
})

test('cache on the Desktop pill: a glyph per state in the ink, no countdown, named in the hover text', () => {
  const ctx = { tokens: 412_000, window: 1_000_000 }
  const badge = (cache?: CacheState) => desktopSegments(input({ ctx, cache, windows: [] }))[0]!
  const warm = badge({ state: 'warm', left: 38 * MIN }), cold = badge({ state: 'cold', left: 0 }), none = badge()
  expect(warm.tip).toBe('Context: 412K of 1M tokens · cache cold in 38m')
  expect(cold.tip).toBe('Context: 412K of 1M tokens · cache cold, the next message re-reads 412K')
  expect(none.tip).toBe('Context: 412K of 1M tokens')
  const glyphs = (b: Badge, parts = DESKTOP_TIERS[0]!) => desktopPill(b, parts).source.match(/<g transform/g)?.length ?? 0
  expect([glyphs(none), glyphs(warm), glyphs(cold)]).toEqual([1, 2, 2]) // the ctx icon, then the cache glyph
  expect(desktopPill(warm).source).not.toBe(desktopPill(badge({ state: 'soon', left: 4 * MIN })).source) // flame, hourglass
  expect(desktopPill(cold).source).toContain('M12 2v6.5l3 1.72') // Tabler's snowflake: a branch on each arm
  expect(desktopPill(cold).source).not.toContain('M12 3v18') // not the old asterisk
  // a block icon is the pill's glyph: the same scale and stroke at its own spot, in the mockup's accent blue, its 2px gap
  // inside its box
  const ctxG = (s: string) => s.match(/<g [^>]*>.*?<\/g>/)![0].replace(/translate\([^)]*\)/, '').replace(/class="sb-[pa]"/, '')
  const calm = desktopPill(desktopSegments(input({ ctx: { tokens: 50_000, window: 1_000_000 }, windows: [] }))[0]!).source
  const row = icon('<path d="M12 4l-8 4l8 4l8-4z"/><path d="M4 12l8 4l8-4"/><path d="M4 16l8 4l8-4"/>')
  expect(ctxG(row)).toBe(ctxG(calm))
  expect(row).toContain('width="17" height="15"')
  expect(row).toContain('class="sb-a"')
  expect(row).toContain('translate(0 -1)') // 1px up, onto the text's baseline
  const active = badge({ state: 'active', left: 60 * MIN })
  expect(active.tip).toBe('Context: 412K of 1M tokens · cache in use')
  expect(desktopPill(active).width).toBe(desktopPill(warm).width) // a send does not move the row
  expect(desktopPill(active).source.split('</title>')[1]).toBe(desktopPill(warm).source.split('</title>')[1]) // the same flame
  expect(desktopPill(warm).source.split('<text')[1]).not.toContain('38m') // drawn text; the title is the alt text
  expect(desktopPill(warm).width).toBeGreaterThan(desktopPill(none).width)
  expect(glyphs(warm, DESKTOP_TIERS[3]!)).toBe(0) // the narrowest tier drops every icon
  expect(desktopPill(warm, DESKTOP_TIERS[3]!).width).toBe(desktopPill(none, DESKTOP_TIERS[3]!).width)
})

test('cache line in the usage block: time left while warm, the re-read once cold', () => {
  const ctx = { tokens: 412_000, window: 1_000_000 }
  const row = (cache?: CacheState) => usageRows(input({ ctx, cache, windows: [] }))[0]!
  expect(row({ state: 'warm', left: 38 * MIN }).line2).toBe('Cache cold in 38m')
  expect(row({ state: 'cold', left: 0 }).line2).toBe('Cache cold, the next message re-reads 412K')
  expect(row({ state: 'active', left: 60 * MIN }).line2).toBe('Cache in use')
  expect(row().line2).toBeUndefined()
  expect([row({ state: 'warm', left: 38 * MIN }).cache, row({ state: 'cold', left: 0 }).cache, row().cache]).toEqual(['warm', 'cold', undefined]) // picks the line's glyph
})

test('a minute tick redraws for a cache state change, and for its countdown only where one is drawn', () => {
  const key = (cache: CacheState | undefined, drawn: boolean) => minuteKey([], NOW, false, cache, drawn)
  expect(key({ state: 'warm', left: 38 * MIN }, false)).toBe(key({ state: 'warm', left: 37 * MIN }, false)) // Desktop, collapsed
  expect(key({ state: 'warm', left: 38 * MIN }, true)).not.toBe(key({ state: 'warm', left: 37 * MIN }, true)) // terminal or open block
  expect(key({ state: 'soon', left: 30_000 }, false)).not.toBe(key({ state: 'cold', left: 0 }, false)) // the glyph changes
  expect(key({ state: 'warm', left: 5 * MIN }, false)).not.toBe(key({ state: 'soon', left: 4 * MIN }, false))
  expect(key({ state: 'cold', left: 0 }, true)).toBe(key({ state: 'cold', left: 0 }, true))
  expect(minuteKey([], NOW, true)).toBe(minuteKey([], NOW + MIN, true)) // no cache: unchanged rule
})

test('cache state lifecycle: a main request is the clock, its TTL the matching transcript line; a subagent step, a prompt and a precompute change nothing; a model switch is cold, a compaction hides it; pills carry hover text', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.id', async () => ({ value: 'sess-1' }))
  on('fs.list', async () => ({ value: [{ name: '-home-me-other' }, { name: '-home-me-skills' }] }) as never)
  on('fs.exists', async (_$, e) => ({ value: (e as { path: string }).path === '/home/me/.claude/projects/-home-me-skills/sess-1.jsonl' }) as never)
  const tails: string[] = []
  let transcript = '{"type":"user"}' // the engine writes a step's line about 100 ms after the step's result
  on('process.run', async (_$, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'tail') tails.push(argv[3]!)
    return { value: { exitCode: 0, stdout: argv[0] === 'tail' ? transcript : 'main\n', stderr: '' } } as never
  })
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('turn.complete', async () => ({ text: '' }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  const kept = [{ role: 'user', text: 'summary', toolUses: [] }]
  on('session.compact', async (_$, e) => (e.trigger === 'precompute' ? { skip: 'precompute' } : { messages: kept }) as never)
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: Date.now() * 2 })) // the usage fetch's 5-minute gate stays shut
  on('store.set', async () => ({ value: undefined }))

  const terminal = async () => {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 200 } as never })
    const t = (await ui.findAll({ type: 'Text' })).map(x => x.text).find(x => x.startsWith(' ❄'))
    await ui.unmount()
    return t
  }
  // the model request beneath: one text chunk, then the result with the request's counts. The test reads the chunk, looks
  // at the bar while the response streams, then reads to the end
  let usage = { input_tokens: INPUT, output_tokens: 10, cache_read_input_tokens: READ, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'hi' } as never
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage } as never
  })
  // streaming: what the bar shows after the first chunk; false skips that look. shortcut: a mount inside some open steps
  // hangs the kit (a subagent's step inside a turn, a step after a compaction); look there once the kit allows it
  const step = async (e: object, streaming: string | undefined | false) => {
    const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...e } as never)
    await s.next()
    const mid = streaming === false ? false : await terminal()
    for await (const _ of s) { /* to the end: a check that throws with the stream open hangs the test */ }
    await s.result
    expect(mid).toBe(streaming)
  }
  await $.session.measure({ context: { tokens: 412_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  expect(await terminal()).toBeUndefined() // no request yet

  await step({ agentId: 'a1' }, undefined) // a subagent's request says nothing of main's cache
  expect(await terminal()).toBeUndefined()
  expect(tails).toEqual([])

  await step({}, undefined) // the first main request: in flight, but its TTL is unknown until its line is read
  expect(await terminal()).toBeUndefined()
  transcript = usageLine({ ephemeral_1h_input_tokens: 1457, ephemeral_5m_input_tokens: 0 })
  await $.turn.complete({ reason: 'answer', answer: '', text: '', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  expect(tails).toEqual(['/home/me/.claude/projects/-home-me-skills/sess-1.jsonl'])
  expect(await terminal()).toBe(' ❄ 1h') // counted from the send
  await clock.advance(22 * MIN)
  expect(await terminal()).toBe(' ❄ 38m')

  const desktop = () => $.ui.mount({ plugin: 'session-bar', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, view: {} } as never })
  let ui = await desktop()
  // the kit keeps `hover` out of props: a keyed Box per pill (the hover scope) and its hidden child are what show
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.filter(b => b.key?.startsWith('pill-')).map(b => b.key)).toEqual(['pill-ctx-']) // one pill: ctx
  expect(boxes.filter(b => b.props.display === 'none' && b.props.position === 'absolute')).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: 'Context: 412K of 1M tokens · cache cold in 38m' })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).some(s => (s.props as { isInteractive?: boolean }).isInteractive)).toBe(false)
  // the open block: the ctx icon on the name, the pill's cache glyph on the cache line, nothing on the range line
  const glyphs = async () => (await ui.findAll({ type: 'Svg' })).filter(s => / pill$|^cache /.test((s.props as { alt: string }).alt)).map(s => (s.props as { source: string }).source)
  // shape, size and stroke as on the pill; the ink is always the mockup's accent blue here, whatever the pill's state
  const g = (s: string) => s.match(/<g [^>]*>.*?<\/g>/)![0].replace(/translate\([^)]*\)/, '').replace(/class="sb-[pa]"/, '')
  const pillCache = async () => g((await ui.findAll({ type: 'Svg' })).map(s => (s.props as { source: string }).source).find(s => s.includes('<title>Context'))!.match(/<g [^>]*>.*?<\/g>/g)![1]!)
  await ui.press({ key: 'usage' })
  let [name, line] = await glyphs()
  expect(await glyphs()).toHaveLength(2)
  expect(name).toContain('M12 4l-8 4l8 4l8-4z') // the stack
  expect(name).toContain('class="sb-a"')
  expect(g(line!)).toBe(await pillCache()) // the flame, as on the pill
  await ui.unmount()
  await clock.advance(34 * MIN)
  ui = await desktop() // the open state is the session's, so the block is still open
  ;[, line] = await glyphs()
  expect(line).toContain('M6.5 7h11') // the hourglass with 4 minutes left
  expect(g(line!)).toBe(await pillCache())
  await ui.unmount()
  await clock.advance(6 * MIN)
  ui = await desktop()
  ;[, line] = await glyphs()
  expect(line).toContain('M12 2v6.5l3 1.72') // the snowflake once cold
  expect(line).toContain('class="sb-a"')
  expect(g(line!)).toBe(await pillCache())
  await ui.press({ key: 'usage' })
  await ui.unmount()

  await $.prompt.submit({ text: '/help', wait: false, origin: { kind: 'person' } } as never)
  expect(await terminal()).toBe(' ❄ cold') // a prompt sends no request by itself: a local slash command leaves the state as it was

  usage = { ...usage, cache_read_input_tokens: 412_000, input_tokens: 5_000 }
  await step({ turnId: 't2' }, ' ❄ in use') // the request streams: in use, no countdown
  expect(await terminal()).toBe(' ❄ 1h') // the response ended: the TTL last read, from the send; this step's line is not there yet
  expect(tails).toHaveLength(2) // read again at the step's entry, for the previous step's line
  await clock.advance(10 * MIN)
  await step({ turnId: 't2', index: 1, agentId: 'a1' }, false) // a subagent's request inside the turn: main's clock runs on
  expect(await terminal()).toBe(' ❄ 50m')
  await clock.advance(60 * MIN)
  expect(await terminal()).toBe(' ❄ cold') // a wait inside the turn goes cold like idle time

  await $.session.compact({ trigger: 'precompute', messages: kept } as never)
  expect(await terminal()).toBe(' ❄ cold') // a precompute changes nothing
  await step({ turnId: 't3', model: 'claude-sonnet-5-5' }, false) // another model: cold while it streams (the next test), then from its send
  expect(await terminal()).toBe(' ❄ 1h')
  await $.session.compact({ trigger: 'auto', messages: kept } as never)
  expect(await terminal()).toBeUndefined() // compacted: nothing until the next request ends
  await step({ turnId: 't4', model: 'claude-sonnet-5-5' }, false)
  expect(await terminal()).toBeUndefined() // its TTL is unknown again until its line is read
  await $.session.measure({ context: { tokens: 412_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never) // the compaction dropped the reading; the reply's brings it back
  transcript = usageLine({ ephemeral_5m_input_tokens: 90_000 }, 412_000, 5_000)
  await $.turn.complete({ reason: 'answer', answer: '', text: '', durationMs: 1, isAborted: false, turnId: 't4' } as never)
  expect(await terminal()).toBe(' ❄ 5m') // a 5-minute write: the shorter TTL
})

test('a request that names another model is cold while it streams: the cache is keyed by model', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', async () => ({ value: 'sess-1' }))
  on('fs.list', async () => ({ value: [{ name: '-home-me-skills' }] }) as never)
  on('fs.exists', async () => ({ value: true }) as never)
  on('process.run', async (_$, e) => ({ value: { exitCode: 0, stdout: (e as { argv: string[] }).argv[0] === 'tail' ? usageLine({ ephemeral_1h_input_tokens: 1457 }) : 'main\n', stderr: '' } }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: Date.now() * 2 }))
  on('store.set', async () => ({ value: undefined }))
  const usage = { input_tokens: INPUT, output_tokens: 10, cache_read_input_tokens: READ, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'hi' } as never
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage } as never
  })
  const terminal = async () => {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 200 } as never })
    const t = (await ui.findAll({ type: 'Text' })).map(x => x.text).find(x => x.startsWith(' ❄'))
    await ui.unmount()
    return t
  }
  await $.session.measure({ context: { tokens: 412_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  let s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)
  for await (const _ of s) { /* to the end */ }
  await $.turn.complete({ reason: 'answer', answer: '', text: '', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  expect(await terminal()).toBe(' ❄ 1h') // answered by Opus
  s = $.turn.step({ turnId: 't2', index: 0, model: 'claude-sonnet-5-5', messageCount: 3 } as never)
  await s.next()
  const mid = await terminal()
  for await (const _ of s) { /* to the end */ }
  expect(mid).toBe(' ❄ cold')
  expect(await terminal()).toBe(' ❄ 1h') // its response ended: warm again, from its send
})

test('a compaction that ran drops the context reading, segment and pill, until the next reading; a precompute, a skip and a subagent leave it', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.set', async () => ({ value: undefined }))
  on('session.compact', async (_$, e) => (e.trigger === 'precompute' ? { skip: 'precompute' } : e.trigger === 'manual' ? { skip: 'nothing to do' } : { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }) as never)
  const drawn = async () => {
    const found = []
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'session-bar', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 200, view: {} } as never })
      // the terminal's ctx segment, and on Desktop the pill, whose alt text names the context
      found.push(surface === 'terminal' ? !!(await ui.find({ type: 'Text', text: 'ctx ' })) : (await ui.findAll({ type: 'Svg' })).some(s => (s.props as { alt: string }).alt.startsWith('Context:')))
      await ui.unmount()
    }
    return found
  }
  const measure = () => $.session.measure({ context: { tokens: 187_400, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)

  await measure()
  expect(await drawn()).toEqual([true, true])
  const messages = [{ role: 'user', text: 'summary', toolUses: [] }]
  await $.session.compact({ trigger: 'precompute', messages } as never)
  await $.session.compact({ trigger: 'manual', messages } as never)
  await $.session.compact({ trigger: 'auto', agentId: 'a1', messages } as never)
  expect(await drawn()).toEqual([true, true]) // nothing ran, or a subagent's did
  await $.session.compact({ trigger: 'auto', messages } as never)
  expect(await drawn()).toEqual([false, false])
  await measure() // the next reply's reading, even with the old count
  expect(await drawn()).toEqual([true, true])
})

test('accuracy line: the cache prediction against the previous input, the ctx shown against this input, the header against the endpoint', () => {
  const line = (over: Partial<Parameters<typeof accuracyLine>[0]>) =>
    accuracyLine({ read: 411_900, prevTotal: 412_000, shown: 412_500, total: 412_500, header: [], ...over })
  expect(line({ predicted: 'warm' })).toContain('cache predicted warm, read 411900 of 412000: confirmed')
  expect(line({ predicted: 'soon', read: 1_200 })).toContain('read 1200 of 412000: wrong')
  expect(line({ predicted: 'cold', read: 1_200 })).toContain(': confirmed') // went cold and paid for it
  expect(line({ predicted: 'cold' })).toContain(': wrong') // said cold, the cache answered
  expect(line({ predicted: 'warm', read: 403_760 })).toContain(': confirmed') // 2% under is still a hit
  expect(line({ predicted: 'warm', read: 403_759 })).toContain(': wrong')
  expect(line({})).toContain('cache predicted none, read 411900 of 412000: unscored') // nothing was shown at the send
  expect(line({ predicted: 'warm', prevTotal: undefined })).toContain('of ?: unscored')
  expect(line({})).toContain('ctx shown 412500, input 412500: match')
  expect(line({ shown: 412_000 })).toContain('ctx shown 412000, input 412500: differ')
  const header = [{ kind: 'five_hour', percentUsed: 23.4 }, { kind: 'seven_day', percentUsed: 61 }]
  expect(line({ header, endpoint: [{ kind: 'five_hour', percentUsed: 23 }] })).toContain('5h header 23% endpoint 23% | 7d header 61% endpoint n/a')
  expect(line({ header })).toContain('5h header 23% endpoint n/a')
})

test('one accuracy line per main request, to the debug log: the prediction made at the send, scored against the counts', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.id', async () => ({ value: 'sess-1' }))
  on('fs.list', async () => ({ value: [{ name: '-home-me-skills' }] }) as never)
  on('fs.exists', async () => ({ value: true }) as never)
  const transcript = usageLine({ ephemeral_1h_input_tokens: 1457, ephemeral_5m_input_tokens: 0 }, 411_900, 100)
  on('process.run', async (_$, e) => ({ value: { exitCode: 0, stdout: (e as { argv: string[] }).argv[0] === 'tail' ? transcript : 'main\n', stderr: '' } }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async (_$, e) => ({ value: (e as { key: string }).key === 'endpoint' ? [{ kind: 'five_hour', percentUsed: 23 }] : undefined }))
  on('store.set', async () => ({ value: undefined }))
  const lines: string[] = []
  on('ui.log', async (_$, e) => { lines.push(`${e.to}: ${e.text}`); return { value: undefined } as never })
  let usage = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 411_900, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'hi' } as never
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage } as never
  })
  const step = async (e: object = {}) => { for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...e } as never)) { /* drain */ } }

  await $.session.measure({ context: { tokens: 412_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23.4 }], changed: ['context', 'rateLimits'] } as never)
  await step() // the first request: no state was shown at the send
  expect(lines).toEqual(['debug: cache predicted none, read 411900 of 412000: unscored | ctx shown 412000, input 412000: match | 5h header 23% endpoint 23%'])
  await step({ agentId: 'a1' })
  expect(lines).toHaveLength(1) // a subagent's request is not scored
  await step() // its line is read at this entry, so the cache was warm at the send, and it read all of it
  expect(lines[1]).toContain('cache predicted warm, read 411900 of 412000: confirmed')
  await clock.advance(61 * 60_000)
  usage = { ...usage, cache_read_input_tokens: 1_200, cache_creation_input_tokens: 410_700 }
  await step() // an hour on: cold at the send, and it paid for the whole context
  expect(lines[2]).toContain('cache predicted cold, read 1200 of 412000: confirmed')
  expect(lines).toHaveLength(3)
})

test('a fallback model answered: the usage block says so, the segment keeps the configured model, and the same model says nothing', async ($, on) => {
  const b = (answered?: string) => usageRows(input({ ctx: { tokens: 120_000, window: 1_000_000 }, windows: [], answered }))[0]!.more
  expect(b('Sonnet 5.5')).toEqual(['Answered by Sonnet 5.5'])
  expect(b()).toBeUndefined() // the configured model answered: no extra line

  mock.clock(on, { now: NOW })
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5[1m]' })) // the API's id for the same model has no [1m]
  on('session.id', async () => ({ value: 'sess-1' }))
  on('fs.list', async () => ({ value: [] }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ value: undefined }))
  let answeredBy = 'claude-sonnet-5-5'
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'hi' } as never
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 0, model: answeredBy }
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage } as never
  })
  const step = async () => { for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)) { /* drain */ } }
  const mount = (surface: 'desktop' | 'terminal') => $.ui.mount({ plugin: 'session-bar', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 200, view: {} } as never })
  const seen = async () => {
    let ui = await mount('desktop')
    await ui.press({ key: 'usage' })
    const answered = !!(await ui.find({ type: 'Text', text: 'Answered by Sonnet 5.5' }))
    await ui.press({ key: 'usage' })
    await ui.unmount()
    ui = await mount('terminal')
    const configured = !!(await ui.find({ type: 'Text', text: ' · Opus 5.5 1M' }))
    await ui.unmount()
    return { answered, configured }
  }

  await $.session.measure({ context: { tokens: 187_400, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  await step()
  expect(await seen()).toEqual({ answered: true, configured: true })
  answeredBy = 'claude-opus-5-5'
  await step()
  expect(await seen()).toEqual({ answered: false, configured: true })
})

test('the auto-compact threshold: read once at each main turn end, summary only, caps the red line; a measure keeps it', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ deny: 'logged out' }))
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ value: undefined }))
  const asks: unknown[] = []
  let threshold: number | undefined = 200_000 // the breakdown leaves it out with auto-compact off
  on('session.usage', async (_$, e) => {
    asks.push(e)
    return { value: { startedAt: 0, context: { window: 1_000_000, breakdown: { autoCompactThreshold: threshold } }, rateLimits: [] } } as never
  })
  const pill = async (text: string) => {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 200 } as never })
    const bg = (await ui.find({ type: 'Text', text }))?.props.backgroundColor
    await ui.unmount()
    return bg
  }
  const done = (agentId?: string) => $.turn.complete({ reason: 'answer', answer: '', text: '', durationMs: 1, isAborted: false, turnId: 't1', agentId } as never)

  await done() // no context reading yet: nothing to attach it to, and no call
  expect(asks).toEqual([])
  await $.session.measure({ context: { tokens: 170_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  expect(await pill('170K')).toBe('#E69F00') // 170K of 1M: past the ideal range, below 250K
  await done('a1')
  expect(asks).toEqual([]) // a subagent's turn says nothing of main's window
  await done()
  expect(asks).toEqual([{ breakdown: 'summary' }]) // never 'full': it sends token-count requests
  expect(await pill('170K')).toBe('#D55E00') // 80% of 200K is 160K
  await $.session.measure({ context: { tokens: 171_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  expect(await pill('171K')).toBe('#D55E00') // the threshold stood through the measure
  threshold = undefined
  await done()
  expect(await pill('171K')).toBe('#E69F00') // auto-compact off: back to 80% of the window
  expect(asks).toHaveLength(2)
})

test('a usage fetch stamps usageAt on success only and keeps the endpoint for the accuracy line; 23.4% from a header and 23% from the endpoint do not redraw', async ($, on) => {
  let now = 1e12, ok = true, offline = false
  const kept: Record<string, unknown> = {}
  const writes: string[] = []
  const reset = '2099-01-01T00:00:00Z'
  on('session.authorize', async () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', async () => {
    if (offline) throw new Error('offline')
    return { value: { status: ok ? 200 : 500, ok, headers: {}, text: JSON.stringify({ limits: [{ kind: 'session', percent: 23, resets_at: reset, scope: null }] }) } }
  })
  on('clock.now', async () => ({ value: now }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('turn.complete', async () => ({ text: '' }))
  on('store.get', async (_$, e) => ({ value: kept[(e as { key: string }).key] }))
  on('store.set', async (_$, e) => { kept[(e as { key: string }).key] = (e as { value: unknown }).value; return { value: undefined } })
  on('state.set', async (_$, e, next) => { writes.push((e as { key: string }).key); return next(e) })
  on('session.id', async () => ({ value: 'sess-1' }))
  on('fs.list', async () => ({ value: [] }) as never)
  const lines: string[] = []
  on('ui.log', async (_$, e) => { lines.push(e.text); return { value: undefined } as never })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 411_900, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' } } as never
  })
  const turn = async () => { now += 300_000; await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' }) }

  await $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 23.4, resetsAt: reset }], changed: ['rateLimits'] } as never) // the header's reading
  writes.length = 0
  ok = false
  await turn() // the endpoint answers an error
  offline = true
  await turn() // the request throws
  expect(kept.fetchedAt).toBe(now) // both took the claim
  expect(kept.usageAt).toBeUndefined() // and neither is a fresh reading
  expect(kept.endpoint).toBeUndefined()
  offline = false
  ok = true
  await turn()
  expect(kept.usageAt).toBe(now)
  expect(kept.endpoint).toEqual([{ kind: 'five_hour', percentUsed: 23, resetsAt: reset }])
  expect(writes).toEqual([]) // 23 against 23.4: the same reading, so no redraw
  const good = now
  ok = false
  await turn()
  expect(kept.usageAt).toBe(good) // a later failure leaves the last success

  await $.session.measure({ context: { tokens: 412_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)) { /* drain */ }
  expect(lines[0]).toContain('5h header 23% endpoint 23%') // the log reads what the fetch stored
})

test('an idle session fetches usage from the minute tick once the reading is over 5 minutes old, or a window reset, and only with a surface attached', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, {})
  let pct = 40, resetsIn = 5 * 3_600_000, fetches = 0
  let surfaces: string[] = ['terminal']
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.authorize', async () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', async () => {
    fetches++
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ limits: [{ kind: 'session', percent: pct, resets_at: new Date(clock.now() + resetsIn).toISOString(), scope: null }] }) } }
  })
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('session.start', async (_$, e) => e as never)
  on('ui.render', async () => h('Box', {}) as never)
  const shown = async (text: string) => {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never })
    const found = !!(await ui.find({ type: 'Text', text }))
    await ui.unmount()
    return found
  }

  await $.session.start({ source: 'startup', cwd: '/home/me/skills', surface: 'terminal', isInteractive: true } as never)
  await clock.advance(0) // the launch fetch is not awaited
  expect(fetches).toBe(1)
  expect(await shown('40%')).toBe(true)
  pct = 55 // another session spent
  await clock.advance(5 * 60_000)
  expect(fetches).toBe(1) // 5 minutes old is not over 5 minutes
  expect(await shown('40%')).toBe(true)
  await clock.advance(2 * 60_000) // 7 minutes in: the 6-minute tick fetched
  expect(fetches).toBe(2)
  expect(await shown('55%')).toBe(true)

  surfaces = [] // detached: no fetch, however old
  await clock.advance(12 * 60_000)
  expect(fetches).toBe(2)

  surfaces = ['terminal']
  resetsIn = 4 * 60_000 // the next reading's window resets 4 minutes after it is fetched
  await clock.advance(60_000)
  expect(fetches).toBe(3)
  resetsIn = -1 // from here the endpoint answers a window already past its reset
  await clock.advance(3 * 60_000)
  expect(fetches).toBe(3) // not reset yet
  await clock.advance(60_000) // the window reset at this tick: fetched at once, past the 5-minute gate
  expect(fetches).toBe(4)
  expect(await shown('5h ')).toBe(false) // the endpoint answered the old window: kept out, not drawn
  await clock.advance(60_000)
  expect(fetches).toBe(4) // dropped from the state, so it does not force a fetch a minute
  pct = 10
  resetsIn = 5 * 3_600_000
  await clock.advance(5 * 60_000) // the reading is over 5 minutes old again
  expect(fetches).toBe(5)
  expect(await shown('10%')).toBe(true)
})

test('usage reading age: a dim line under the rows once the fetch is over 10 minutes old, in the reset time\'s format; nothing sooner', async ($, on) => {
  const now = new Date(2026, 9, 14, 14, 35).getTime() // local time, so the test holds in any zone
  const at = (...t: [number, number, number, number, number]) => new Date(...t).getTime()
  expect(usageAge(now - 3 * MIN, now)).toBeUndefined()
  expect(usageAge(now - 10 * MIN, now)).toBeUndefined() // over 10, not 10
  expect(usageAge(at(2026, 9, 14, 14, 20), now)).toBe('Usage as of 14:20')
  expect(usageAge(at(2026, 9, 13, 17, 30), now)).toBe('Usage as of Tue 17:30') // yesterday: its weekday
  expect(usageAge(undefined, now)).toBeUndefined() // never fetched: nothing to date

  let clock = now
  const kept: Record<string, unknown> = {}
  on('session.root', async () => ({ value: '/home/me' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', async () => ({ value: clock }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.render', async () => h('Box', {}) as never)
  on('store.get', async (_$, e) => ({ value: kept[(e as { key: string }).key] }))
  on('store.set', async () => ({ value: undefined }))
  await $.session.measure({ context: { tokens: 50_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], changed: ['context', 'rateLimits'] } as never)
  const block = async () => {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 9, bodyColumns: 120, view: {} } as never })
    await ui.press({ key: 'usage' })
    const found = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.startsWith('Usage as of'))
    await ui.press({ key: 'usage' })
    await ui.unmount()
    return found
  }
  kept.usageAt = now - 3 * MIN
  expect(await block()).toEqual([])
  kept.usageAt = at(2026, 9, 14, 14, 20)
  expect(await block()).toEqual(['Usage as of 14:20'])
})
