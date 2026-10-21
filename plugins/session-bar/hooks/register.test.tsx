import type { On, SessionUsage } from 'claude-code'
import { type Engine, expect, mock, test } from 'claude-code/testing'

const NOW = 1_792_162_404_000
const MIN = 60_000
const PORCELAIN = [
  '# branch.oid 0123456789abcdef',
  '# branch.head main',
  '1 A. N... 100644 100644 100644 a b new.py',
  '? a.txt',
  '? b.txt',
  '1 .M N... 100644 100644 100644 a b edited.py',
  '1 .M N... 100644 100644 100644 a b other.py',
].join('\n')
const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 60_000, window: 1_000_000, percent: 6 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 66, resetsAt: new Date(NOW + 46 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 43, resetsAt: new Date(NOW + (3 * 24 + 21) * 60 * MIN).toISOString() },
  ],
}
const GAUGES = '5h 66% ↻46m · 7d 43% ↻3d21h'
const SURFACES = ['terminal', 'desktop'] as const

// the engine beneath the plugin: a session in repo `main`, two subagents, one of them yet to make a request
const engine = async ($: Engine, on: On, porcelain = PORCELAIN) => {
  const clock = mock.clock(on, { now: NOW })
  on('ui.render', () => h('Box', {}) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: porcelain, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
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
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
  return clock
}

const step = async ($: Engine, agentId: string | undefined, model: string) => {
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model, messageCount: 1, agentId })) { /* drain */ }
}

const rowOn = async ($: Engine, surface: (typeof SURFACES)[number], agentId?: string, bodyColumns = 200) => {
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface, component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns, scroll: { offset: 0, bodyRows: 3 }, view: agentId ? { agentId } : {} },
  })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  await ui.unmount()
  return texts
}

test('main view: git, the main model with its window, context and the windows', async ($, on) => {
  await engine($, on)
  for (const surface of SURFACES) {
    expect(await rowOn($, surface), surface).toBe(`main +3 ~2 · Opus 5.5 1M · ctx 6% · ${GAUGES}`)
  }
})

test('a subagent in view after a Haiku step: its type and model, its tokens, no main model', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  for (const surface of SURFACES) {
    const row = await rowOn($, surface, 'a1')
    expect(row, surface).toBe(`main +3 ~2 · Explore · Haiku 4.5 · ctx 42K · ${GAUGES}`)
    expect(row, surface).not.toContain('Opus')
  }
  expect(await rowOn($, 'terminal')).toBe(`main +3 ~2 · Opus 5.5 1M · ctx 6% · ${GAUGES}`)
})

test('a subagent with no step yet: its type, no model and no context', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  await step($, undefined, 'claude-fable-5-1')
  for (const surface of SURFACES) {
    expect(await rowOn($, surface, 'a2'), surface).toBe(`main +3 ~2 · Plan · ${GAUGES}`)
  }
})

test('a narrow band cuts git only', async ($, on) => {
  await engine($, on, '# branch.oid 0123456789abcdef\n# branch.head feature/a-very-long-branch-name\n? new.txt\n')
  const gauges = `Opus 5.5 1M · ctx 6% · ${GAUGES}`
  for (const surface of SURFACES) {
    expect(await rowOn($, surface, undefined, [...gauges].length + 3 + 10), surface).toBe(`feature/a… · ${gauges}`)
    expect(await rowOn($, surface, undefined, 20), surface).toBe(gauges)
  }
})

test('a band left open redraws its countdowns every 30 seconds', async ($, on) => {
  const clock = await engine($, on)
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 200, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  })
  const fiveHour = async () => (await ui.find({ type: 'Text', text: /^ ↻/ }))?.text
  const before = await fiveHour()
  await clock.advance(29_000)
  const early = await fiveHour()
  await clock.advance(2 * MIN)
  const after = await fiveHour()
  await ui.unmount()
  // the last tick inside 149 s is at 120 s, so the band shows 46m less two minutes
  expect([before, early, after]).toEqual([' ↻46m', ' ↻46m', ' ↻44m'])
})

test('a survey has the band to itself', async ($, on) => {
  await engine($, on)
  const ui = await $.ui.mount({
    plugin: 'session-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: true, isWorking: false, maxRows: 3, bodyColumns: 200, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: /Opus/ })).toBeUndefined()
  await ui.unmount()
})
