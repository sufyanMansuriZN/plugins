import type { On, SessionUsage } from 'claude-code'
import { type Engine, expect, mock, test } from 'claude-code/testing'

const NOW = 1_792_162_404_000
const MIN = 60_000
const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 60_000, window: 1_000_000, percent: 6 },
  rateLimits: [],
}
// the usage endpoint's answer, which the band shares with the status line script
const LIMITS = JSON.stringify({ limits: [
  { kind: 'session', percent: 66, resets_at: new Date(NOW + 46 * MIN).toISOString() },
  { kind: 'weekly_scoped', percent: 19, resets_at: new Date(NOW + 7200 * MIN).toISOString(), scope: { model: { display_name: 'Fable' } } },
] })
const READING = { at: NOW, limits: [
  { kind: 'five_hour', percent: 66, resetsAt: NOW + 46 * MIN },
  { kind: 'model', name: 'Fable', percent: 19, resetsAt: NOW + 7200 * MIN },
] }
const SHARED = '/home/me/.cache/session-bar/limits.json'
const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const cells = (s: string) => [...s].length

type Setup = { usage?: SessionUsage; fetched?: { ok: boolean; text: string }; env?: Record<string, string> }

// the engine beneath the plugin: a session on Opus with two subagents, one of them yet to make a request;
// writes collects each file the plugin writes, in order
const engine = async ($: Engine, on: On, { usage = USAGE, fetched = { ok: true, text: LIMITS }, env = { HOME: '/home/me' } }: Setup = {}) => {
  const clock = mock.clock(on, { now: NOW })
  const writes: { path: string; text: string }[] = []
  mock.store(on)
  mock.env(on, env)
  on('ui.render', () => h('Box', {}) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: usage }))
  on('session.authorize', () => ({ value: { handle: 'handle', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: fetched.ok ? 200 : 500, ok: fetched.ok, headers: {}, text: fetched.text } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [
    { id: 'a1', type: 'Explore', description: 'look', status: 'running' },
    { id: 'a2', type: 'Plan', description: 'plan', status: 'running' },
  ] as never }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 2_000, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 10_000, output_tokens: 10 },
    }
  })
  await $.session.start({ source: 'startup', cwd: '/home/me/plugins', surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
  return { clock, writes }
}

const step = async ($: Engine, agentId: string | undefined, model: string) => {
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model, messageCount: 1, agentId })) { /* drain */ }
}

const mountBand = ($: Engine, surface: Surface, agentId?: string, bodyColumns = 200) => $.ui.mount({
  plugin: 'session-bar', surface, component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns, scroll: { offset: 0, bodyRows: 3 }, view: agentId ? { agentId } : {} },
})

// what each zone of the row shows, and the cells the right zone keeps clear before it
const zonesOn = async ($: Engine, surface: Surface, agentId?: string, bodyColumns = 200) => {
  const ui = await mountBand($, surface, agentId, bodyColumns)
  const [left, right] = await Promise.all([ui.find({ type: 'Box', key: 'left' }), ui.find({ type: 'Box', key: 'right' })])
  await ui.unmount()
  return { left: left?.text, right: right?.text, gap: right?.props.marginLeft }
}

const NONE = { left: undefined, right: undefined, gap: undefined }

test('the main view draws no row: the status line shows the main conversation', async ($, on) => {
  await engine($, on)
  for (const surface of SURFACES) expect(await zonesOn($, surface), surface).toEqual(NONE)
})

test('the Desktop app draws no row, even for a subagent, and fetches and writes nothing', async ($, on) => {
  const { writes } = await engine($, on, { env: { HOME: '/home/me', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' } })
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  for (const surface of SURFACES) expect(await zonesOn($, surface, 'a1'), surface).toEqual(NONE)
  expect(writes).toEqual([])
})

test('the CLI entrypoint draws a subagent\'s row', async ($, on) => {
  await engine($, on, { env: { HOME: '/home/me', CLAUDE_CODE_ENTRYPOINT: 'cli' } })
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  expect((await zonesOn($, 'terminal', 'a1')).left).toBe('Explore · Haiku 4.5')
})

test('a subagent in view after a Haiku step: its type and model on the left, its tokens on the right; back in the main view, no row', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  for (const surface of SURFACES) {
    const { left, right } = await zonesOn($, surface, 'a1')
    expect([left, right], surface).toEqual(['Explore · Haiku 4.5', 'ctx 42K'])
  }
  expect(await zonesOn($, 'terminal')).toEqual(NONE)
})

test('a subagent with no step yet: its type, no model and no context', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  await step($, undefined, 'claude-fable-5-1')
  for (const surface of SURFACES) {
    const { left, right } = await zonesOn($, surface, 'a2')
    expect([left, right], surface).toEqual(['Plan', undefined])
  }
})

test("a subagent's row at exactly its width keeps every part, and its zones and gap add up to the band", async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  for (const surface of SURFACES) {
    const wide = await zonesOn($, surface, 'a1')
    const columns = cells(wide.left!) + 3 + cells(wide.right!)
    const exact = await zonesOn($, surface, 'a1', columns)
    expect(exact, surface).toEqual(wide)
    expect(cells(exact.left!) + Number(exact.gap) + cells(exact.right!), surface).toBe(columns)
  }
})

test("a subagent's type is dim; no text has a color of its own", async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  for (const surface of SURFACES) {
    const ui = await mountBand($, surface, 'a1')
    expect((await ui.find({ type: 'Text', text: 'Explore' }))?.props.dimColor, surface).toBe(true)
    const inColor = (await ui.findAll({ type: 'Text' })).filter(t => t.props.color !== undefined).map(t => t.text)
    expect(inColor, surface).toEqual([])
    await ui.unmount()
  }
})

test('each fetch writes its reading to the shared file in ~/.cache, at start and at each turn\'s end', async ($, on) => {
  const { clock, writes } = await engine($, on)
  expect(writes.map(w => [w.path, JSON.parse(w.text)])).toEqual([[SHARED, READING]])
  await $.turn.complete({ reason: 'answer', answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't' })
  await clock.settle()
  expect(writes.length).toBe(2)
})

test('the shared file goes under XDG_CACHE_HOME when it is set', async ($, on) => {
  const { writes } = await engine($, on, { env: { HOME: '/home/me', XDG_CACHE_HOME: '/x/cache' } })
  expect(writes.map(w => w.path)).toEqual(['/x/cache/session-bar/limits.json'])
})

for (const [what, fetched] of [['a failed fetch', { ok: false, text: '' }], ['a fetch with no windows', { ok: true, text: '{"limits":[]}' }]] as const) {
  test(`${what} writes nothing, so the last reading stands until it goes stale`, async ($, on) => {
    const { writes } = await engine($, on, { fetched })
    expect(writes).toEqual([])
  })
}

test('an idle session writes a new reading every 5 minutes', async ($, on) => {
  const { clock, writes } = await engine($, on)
  await clock.advance(5 * MIN)
  expect(writes.map(w => JSON.parse(w.text).at)).toEqual([NOW, NOW + 5 * MIN])
})

test('rows another hook draws in the band sit above the bar, so the bar stays on the prompt', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>3 tasks (1 done, 2 open)</Text>
  })
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  const ui = await mountBand($, 'terminal', 'a1')
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  await ui.unmount()
  expect(texts[0]).toBe('3 tasks (1 done, 2 open)')
  expect(texts.slice(1).join('')).toMatch(/^Explore/)
})

test('a survey has the band to itself', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: true, isWorking: false, maxRows: 3, bodyColumns: 200, scroll: { offset: 0, bodyRows: 3 }, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ type: 'Text', text: /Haiku/ })).toBeUndefined()
  await ui.unmount()
})
