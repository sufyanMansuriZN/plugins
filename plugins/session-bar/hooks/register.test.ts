import { test, expect, mock } from 'claude-code/testing'
import {
  band, paceBand, ctxBand, tokensText, shortDir, limitText, parseUsage, fresh, modelLabel,
  elapsed, countdown, bar, cacheRatio, cacheBand, segments, layout, width, WINDOW_MS, WEEK,
} from './register'
import type { BarInput, Run } from './register'

test('bands, dir, labels, weekly parse', async () => {
  expect([49, 50, 79, 80].map(band)).toEqual([undefined, 'warn', 'warn', 'hot'])
  expect(shortDir('/home/me', '/home/me')).toBe('~')
  expect(shortDir('/home/me/.claude/skills', '/home/me')).toBe('skills')
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelLabel('gpt-x')).toBe('gpt-x')
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
  on('session.usage', async () => ({
    value: { startedAt: 0, context: { tokens: 187_400, window: 1_000_000, percent: 19 } as never,
      rateLimits: [{ kind: 'five_hour', percentUsed: 23.4 }, { kind: 'seven_day', percentUsed: 61 }] },
  }))
  on('ui.render', async () => h('Box', {}) as never) // stands for the engine's own band
  on('clock.now', async () => ({ value: 1e12 }))
  on('session.start', async (_$, e) => e as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('turn.complete', async () => ({ text: '' }))
  on('store.set', async () => ({ value: undefined }))

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const hasSurvey of [false, true]) {
      const ui = await $.ui.mount({
        plugin: 'session-bar', surface, component: 'AbovePrompt',
        props: { hasSurvey, isWorking: false, maxRows: 3 } as never,
      })
      expect(await ui.find({ type: 'Text', text: 'skills' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: '187K/1M' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: '187K/1M' })).toBeDefined()
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
  expect([187_400, 1_000_000, 200_000, 1_500_000].map(tokensText)).toEqual(['187K', '1M', '200K', '1.5M'])

  expect(pill(segments(input({ ctx: { tokens: 187_400, window: M } }), 0), '187K/1M')).toBe('#E69F00') // past 150K
  expect(pill(segments(input({ ctx: { tokens: 120_000, window: M } }), 0), '120K/1M')).toBeUndefined()
  expect(pill(segments(input({ ctx: { tokens: 180_000, window: M } }), 0), '180K/1M')).toBe('#E69F00')
  expect(pill(segments(input({ ctx: { tokens: 170_000, window: K200 } }), 0), '170K/200K')).toBe('#D55E00')
  expect(texts(segments(input({ ctx: undefined }), 0))).not.toContain('ctx ')
})

test('tiers and layout', async () => {
  const b = input()
  const [full, noCount, short, none] = ([0, 1, 2, 3] as const).map(t => segments(b, t))
  expect(texts(full!)).toContain('2h40m'.padStart(6))
  expect(texts(full!)).toContain(' 1d7h')
  expect(texts(noCount!).join('')).not.toContain('2h40m')
  expect(texts(noCount!)).toContain('━━╾') // 5h at 23%
  expect(texts(short!)).toContain('━')
  expect(texts(none!).join('')).toBe('skills · Opus 5.5   ctx 120K/1M   5h 23%   7d 61%')

  expect(layout(b)).toEqual(full)
  expect(layout(b, width(full!))).toEqual(full)
  expect(layout(b, width(full!) - 1)).toEqual(noCount)
  expect(layout(b, width(short!))).toEqual(short)
  expect(layout(b, width(none!))).toEqual(none)
  expect(layout(b, 10)).toEqual(none)
})

test('calm segments are bare text; only attention gets a pill, all on its fill', async () => {
  const calm = segments(input({ cache: [98] }), 0)
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

test('cache pill: one miss stays plain, two in a row turn orange', async () => {
  expect(cacheRatio({ input_tokens: 2, cache_read_input_tokens: 98, cache_creation_input_tokens: 0 })).toBe(98)
  expect(cacheRatio({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeUndefined()

  const at = (cache: number[]) => pill(segments(input({ cache }), 0), `${cache.at(-1)}%`)
  expect(at([98])).toBeUndefined() // warm cache
  expect(at([97, 4])).toBeUndefined() // single miss after a break
  expect(at([0])).toBeUndefined() // first response
  expect(at([12, 9])).toBe('#E69F00') // repeated misses
  expect(cacheBand([12, 9])).toBe('warn')
  expect(texts(segments(input(), 0))).not.toContain('cache ') // no reading yet
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

test('cache pill fills from measure', async ($, on) => {
  on('session.root', async () => ({ value: '/home/me/skills' }))
  on('env.get', async () => ({ value: '/home/me' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('clock.now', async () => ({ value: NOW }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('session.usage', async () => ({
    value: { startedAt: 0, rateLimits: [], context: { tokens: 1000, window: 1_000_000, breakdown: {
      apiUsage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 98, cache_creation_input_tokens: 0 },
    } } } as never,
  }))
  on('ui.render', async () => h('Box', {}) as never)

  await $.session.measure({ context: { tokens: 1000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never,
  })
  expect(await ui.find({ type: 'Text', text: 'cache ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '98%' })).toBeDefined()
  await ui.unmount()
})
