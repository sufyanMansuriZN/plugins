import { test, expect, mock, type Engine } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'
import { line, parseGit, type Snapshot } from './register'

const NOW = 1_800_000_000_000
const T0 = NOW + 1 // when the launch fetch's timer fires
const MIN = 60_000
const HOUR = 60 * MIN
const iso = (ms: number) => new Date(ms).toISOString()

const base: Snapshot = { model: 'claude-opus-5-5', window: 1_000_000, limits: [] }

test('line: the example from the brief', () => {
  expect(line({
    git: { branch: 'main', added: 3, changed: 2 }, model: 'claude-opus-5-5', window: 1_000_000, ctx: 42,
    limits: [
      { kind: 'seven_day', pct: 12, resetsAt: NOW + 3 * 24 * HOUR + 4 * HOUR },
      { kind: 'five_hour', pct: 31.4, resetsAt: NOW + 2 * HOUR + 10 * MIN },
    ],
  }, NOW)).toBe('main +3 ~2 · Opus 5.5 1M · ctx 42% · 5h 31% ↻2h10m · 7d 12% ↻3d4h')
})

test('line: git segment clean, dirty one side, and absent outside a repo', () => {
  expect(line({ ...base, git: { branch: 'main', added: 0, changed: 0 } }, NOW)).toBe('main · Opus 5.5 1M')
  expect(line({ ...base, git: { branch: 'feat', added: 0, changed: 4 } }, NOW)).toBe('feat ~4 · Opus 5.5 1M')
  expect(line(base, NOW)).toBe('Opus 5.5 1M')
})

test('line: model labels', () => {
  expect(line({ model: 'claude-opus-5-5[1m]', limits: [] }, NOW)).toBe('Opus 5.5 1M')
  expect(line({ model: 'claude-haiku-4-5-20251001', window: 200_000, limits: [] }, NOW)).toBe('Haiku 4.5 200K')
  expect(line({ model: 'claude-haiku-4-5-20251001', limits: [] }, NOW)).toBe('Haiku 4.5')
  expect(line({ model: 'some-gateway-model', window: 200_000, limits: [] }, NOW)).toBe('some-gateway-model 200K')
})

test('line: ctx absent before a response, marked at 70 and 85', () => {
  expect(line({ ...base, ctx: undefined }, NOW)).toBe('Opus 5.5 1M')
  expect(line({ ...base, ctx: 69 }, NOW)).toBe('Opus 5.5 1M · ctx 69%')
  expect(line({ ...base, ctx: 70 }, NOW)).toBe('Opus 5.5 1M · ctx 70%!')
  expect(line({ ...base, ctx: 85 }, NOW)).toBe('Opus 5.5 1M · ctx 85%!!')
})

test('line: pace marks against the share of the window gone', () => {
  const five = (pct: number, left: number) => line({ ...base, limits: [{ kind: 'five_hour', pct, resetsAt: NOW + left }] }, NOW)
  expect(five(40, 2 * HOUR)).toBe('Opus 5.5 1M · 5h 40% ↻2h') // 60% gone, behind pace
  expect(five(40, 4 * HOUR)).toBe('Opus 5.5 1M · 5h 40%! ↻4h') // 20% gone, 20 ahead
  expect(five(55, 4 * HOUR)).toBe('Opus 5.5 1M · 5h 55%!! ↻4h') // 35 ahead
  expect(five(91, 10 * MIN)).toBe('Opus 5.5 1M · 5h 91%!! ↻10m') // on pace but at the cap
  expect(five(3, 30_000)).toBe('Opus 5.5 1M · 5h 3% ↻<1m')
})

test('line: no reset time marks from 50 and 80', () => {
  const at = (pct: number) => line({ ...base, limits: [{ kind: 'seven_day', pct }] }, NOW)
  expect(at(49)).toBe('Opus 5.5 1M · 7d 49%')
  expect(at(50)).toBe('Opus 5.5 1M · 7d 50%!')
  expect(at(80)).toBe('Opus 5.5 1M · 7d 80%!!')
})

test('line: a reading past its reset is dropped, spend_limit shows as $', () => {
  expect(line({ ...base, limits: [
    { kind: 'five_hour', pct: 88, resetsAt: NOW - 1 },
    { kind: 'seven_day', pct: 10, resetsAt: NOW + 24 * HOUR },
  ] }, NOW)).toBe('Opus 5.5 1M · 7d 10% ↻1d')
  expect(line({ ...base, limits: [{ kind: 'spend_limit', pct: 40 }] }, NOW)).toBe('Opus 5.5 1M · $ 40%')
})

test('git status v2: branch, untracked and added count as +, the rest as ~, detached as the short sha', () => {
  expect(parseGit('# branch.oid 0123456789abcdef\n# branch.head main\n# branch.upstream origin/main\n')).toEqual({ branch: 'main', added: 0, changed: 0 })
  expect(parseGit([
    '# branch.oid 0123456789abcdef', '# branch.head feat',
    '1 .M N... 100644 100644 100644 a b src/a.ts', '1 A. N... 000000 100644 100644 0 b src/new.ts',
    '1 D. N... 100644 000000 000000 a 0 old.ts', '2 R. N... 100644 100644 100644 a b R100 to.ts\tfrom.ts',
    '? notes.md', '? scratch.txt', '',
  ].join('\n'))).toEqual({ branch: 'feat', added: 3, changed: 3 })
  expect(parseGit('# branch.oid 0123456789abcdef\n# branch.head (detached)\n').branch).toBe('0123456')
  expect(parseGit('# branch.oid (initial)\n# branch.head main\n').branch).toBe('main')
})

type Rejectable = 'process.run' | 'session.usage' | 'session.authorize'

type World = {
  usage: SessionUsage
  git: { exitCode: number; stdout: string }
  endpoint?: unknown[]
  auth: boolean
  reject: Set<Rejectable>
  statuses: (string | undefined)[]
  fetches: number
}

const GIT = '# branch.oid 0123456789abcdef\n# branch.head main\n? a\n1 .M N... x x x a b b.ts\n'

const world = (on: On): World => {
  const w: World = {
    usage: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] },
    git: { exitCode: 0, stdout: GIT },
    auth: true,
    reject: new Set(),
    statuses: [],
    fetches: 0,
  }
  const refuse = (op: Rejectable) => { if (w.reject.has(op)) throw new Error(`${op} failed`) }
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', async () => { refuse('session.usage'); return { value: w.usage } })
  on('process.run', async () => { refuse('process.run'); return { value: { ...w.git, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('session.authorize', async () => { refuse('session.authorize'); return { value: w.auth ? { handle: 'tok', kind: 'bearer' } : null } as never })
  on('http.fetch', async () => {
    w.fetches++
    return w.endpoint
      ? { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ limits: w.endpoint }) } }
      : { value: { status: 500, ok: false, headers: {}, text: '' } }
  })
  on('ui.status', async (_$, e) => { w.statuses.push(e.text); return { value: undefined } as never })
  on('session.start', async (_$, e) => e as never)
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  on('session.compact', async (_$, e) => ({ messages: e.messages }) as never)
  return w
}

const start = ($: Engine) =>
  $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
const step = async ($: Engine) => {
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)) { /* drain */ }
}
const complete = ($: Engine) =>
  $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, reason: 'answer' } as never)
const compact = ($: Engine) =>
  $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
const last = (w: World) => w.statuses[w.statuses.length - 1]

test('session.start draws git and model at once, then the usage endpoint fills 5h and 7d', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.endpoint = [
    { kind: 'session', percent: 31, resets_at: iso(T0 + 2 * HOUR + 10 * MIN) },
    { kind: 'weekly_all', percent: 12, resets_at: iso(T0 + 3 * 24 * HOUR + 4 * HOUR) },
    { kind: 'weekly_scoped', percent: 50 },
  ]
  await start($)
  expect(w.statuses).toEqual(['main +1 ~1 · Opus 5.5 1M'])
  await clock.advance(1)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻2h10m · 7d 12% ↻3d4h')
})

test('outside a repo, and with the endpoint failing, the line is the model alone', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.git = { exitCode: 128, stdout: '' }
  await start($)
  await clock.advance(1)
  expect(w.fetches).toBe(1)
  expect(w.statuses).toEqual(['Opus 5.5 1M'])
})

test('a turn.step with new usage changes the line; the same text twice is set once; unknown windows are ignored', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  await start($)
  w.usage = {
    ...w.usage,
    context: { window: 1_000_000, tokens: 420_000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(NOW + 3 * HOUR) }, { kind: 'mystery', percentUsed: 5 }],
  }
  await step($)
  await clock.settle()
  await step($)
  await clock.settle()
  expect(w.statuses).toEqual(['main +1 ~1 · Opus 5.5 1M', 'main +1 ~1 · Opus 5.5 1M · ctx 42% · 5h 20% ↻3h'])
})

test('the newest reading wins whole: a header after the fetch beats it, a later fetch beats the header', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  const reset = T0 + 4 * HOUR
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(reset) }, { kind: 'weekly_all', percent: 12, resets_at: iso(T0 + 5 * 24 * HOUR) }]
  await start($)
  await clock.advance(1)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻4h · 7d 12% ↻5d')

  await clock.advance(MIN)
  w.usage = { ...w.usage, rateLimits: [{ kind: 'five_hour', percentUsed: 33, resetsAt: iso(reset) }] }
  await step($)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 33% ↻3h59m')

  w.endpoint = [{ kind: 'session', percent: 45, resets_at: iso(reset) }]
  await clock.advance(5 * MIN)
  expect(w.fetches).toBe(2)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 45%! ↻3h54m')
})

test('a turn.complete with no new response does not make the headers newer than a later fetch', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  const reset = T0 + 4 * HOUR
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(reset) }]
  await start($)
  await clock.advance(1)
  await clock.advance(MIN)
  w.usage = { ...w.usage, rateLimits: [{ kind: 'five_hour', percentUsed: 33, resetsAt: iso(reset) }] }
  await step($)
  await clock.settle()
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 33% ↻3h59m')

  w.endpoint = [{ kind: 'session', percent: 45, resets_at: iso(reset) }]
  await clock.advance(5 * MIN)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 45%! ↻3h54m')
  await complete($)
  await clock.settle()
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 45%! ↻3h54m')
})

test('an endpoint answer with no usable limit keeps the last good reading', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(T0 + 4 * HOUR) }]
  await start($)
  await clock.advance(1)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻4h')

  w.endpoint = []
  await clock.advance(6 * MIN)
  expect(w.fetches).toBe(2)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻3h54m')

  w.endpoint = [{ kind: 'session', percent: null, resets_at: 'soon' }]
  await clock.advance(MIN)
  expect(w.fetches).toBe(3)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻3h53m')
})

test('a reset time that does not parse leaves the window with no countdown', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.endpoint = [{ kind: 'session', percent: 20, resets_at: 'soon' }]
  await start($)
  await clock.advance(1)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 20%')
})

test('a failed launch fetch is tried again a minute later, not five', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  await start($)
  await clock.advance(1)
  expect(w.fetches).toBe(1)
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(T0 + 4 * HOUR) }, { kind: 'weekly_all', percent: 12, resets_at: iso(T0 + 5 * 24 * HOUR) }]
  await clock.advance(90_000 - 1)
  expect(w.fetches).toBe(2)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻3h58m · 7d 12% ↻4d23h')
})

test('turn.complete reads git again', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  await start($)
  w.git = { exitCode: 0, stdout: '# branch.oid 0123456789abcdef\n# branch.head feat\n' }
  await complete($)
  await clock.settle()
  expect(last(w)).toBe('feat · Opus 5.5 1M')
})

test('session.compact drops ctx when usage has no percent', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  await start($)
  w.usage = { ...w.usage, context: { window: 1_000_000, tokens: 420_000, percent: 42 } }
  await step($)
  await clock.settle()
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · ctx 42%')
  w.usage = { ...w.usage, context: { window: 1_000_000 } }
  await compact($)
  await clock.settle()
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M')
})

test('after a reload, headers already there lose to the endpoint', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  const reset = T0 + 4 * HOUR
  w.usage = { ...w.usage, rateLimits: [{ kind: 'five_hour', percentUsed: 33, resetsAt: iso(reset) }] }
  w.endpoint = [{ kind: 'session', percent: 45, resets_at: iso(reset) }]
  await start($)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 33% ↻4h')
  await clock.advance(1)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 45%! ↻4h')
})

test('an endpoint failure after a good reading keeps the good reading', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(T0 + 4 * HOUR) }]
  await start($)
  await clock.advance(1)
  w.endpoint = undefined
  await clock.advance(6 * MIN)
  expect(w.fetches).toBe(2)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻3h54m')
})

test('idle, the countdown moves with the clock', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(T0 + 4 * HOUR) }]
  await start($)
  await clock.advance(1)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻4h')
  await clock.advance(MIN)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M · 5h 31% ↻3h59m')
})

test('a failing git, usage or authorize call leaves the rest of the line', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.reject = new Set(['process.run', 'session.usage', 'session.authorize'])
  w.endpoint = [{ kind: 'session', percent: 31, resets_at: iso(T0 + 4 * HOUR) }]
  await start($)
  await clock.advance(1)
  await step($)
  await complete($)
  await compact($)
  await clock.settle()
  expect(w.fetches).toBe(0)
  expect(w.statuses).toEqual(['Opus 5.5'])
})

test('with no credential there is no fetch', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  w.auth = false
  await start($)
  await clock.advance(10 * MIN)
  expect(w.fetches).toBe(0)
  expect(last(w)).toBe('main +1 ~1 · Opus 5.5 1M')
})
