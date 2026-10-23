import { describe, expect, test } from 'claude-code/testing'

import { parseLimits } from './usage'

const body = (limits: unknown) => JSON.stringify({ limits })

describe('the usage endpoint, parsed', () => {
  test('session, weekly_all and a model weekly window become the three kinds', () => {
    expect(parseLimits(body([
      { kind: 'session', percent: 66, resets_at: '2026-10-23T18:00:00.000Z' },
      { kind: 'weekly_all', percent: 43, resets_at: '2026-10-27T03:00:00.000Z' },
      { kind: 'weekly_scoped', percent: 12, resets_at: '2026-10-27T03:00:00.000Z', scope: { model: { display_name: 'Fable' } } },
    ]))).toEqual([
      { kind: 'five_hour', percent: 66, resetsAt: Date.parse('2026-10-23T18:00:00.000Z') },
      { kind: 'seven_day', percent: 43, resetsAt: Date.parse('2026-10-27T03:00:00.000Z') },
      { kind: 'model', name: 'Fable', percent: 12, resetsAt: Date.parse('2026-10-27T03:00:00.000Z') },
    ])
  })

  test('a reset given as Unix seconds becomes milliseconds', () => {
    expect(parseLimits(body([{ kind: 'session', percent: 5, resets_at: 1_792_162_404 }])))
      .toEqual([{ kind: 'five_hour', percent: 5, resetsAt: 1_792_162_404_000 }])
  })

  test('a weekly_scoped window without a model name, and any unknown kind, is left out', () => {
    expect(parseLimits(body([
      { kind: 'weekly_scoped', percent: 9, scope: {} },
      { kind: 'something_new', percent: 9 },
    ]))).toEqual([])
  })

  test('a body that is not JSON, or has no limits list, gives nothing', () => {
    expect(parseLimits('<html>')).toEqual([])
    expect(parseLimits('{}')).toEqual([])
    expect(parseLimits(body([{ kind: 'session', percent: 'high' }]))).toEqual([])
  })
})
