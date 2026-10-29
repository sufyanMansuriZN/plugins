import { describe, expect, test } from 'claude-code/testing'

import { parseLimits, parseShared, sharedPath } from './usage'

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

describe('the reading shared with the status line', () => {
  const NOW = 1_792_162_404_000
  const FABLE = { kind: 'model', name: 'Fable', percent: 19, resetsAt: NOW + 5 * 86_400_000 } as const
  const shared = (at: number, limits: unknown) => JSON.stringify({ at, limits })

  test('it lives in the user cache folder: XDG_CACHE_HOME when absolute, else ~/.cache', () => {
    expect(sharedPath('/x/cache', '/home/me')).toBe('/x/cache/session-bar/limits.json')
    expect(sharedPath(undefined, '/home/me')).toBe('/home/me/.cache/session-bar/limits.json')
    expect(sharedPath('relative/cache', '/home/me')).toBe('/home/me/.cache/session-bar/limits.json')
    expect(sharedPath(undefined, undefined)).toBe(null)
  })

  test('a reading reads back as its limits while it is fresh', () => {
    expect(parseShared(shared(NOW - 14 * 60_000, [FABLE]), NOW)).toEqual([FABLE])
  })

  test('a reading older than 15 minutes, or from the future, gives nothing', () => {
    expect(parseShared(shared(NOW - 16 * 60_000, [FABLE]), NOW)).toEqual([])
    expect(parseShared(shared(NOW + 60_000, [FABLE]), NOW)).toEqual([])
  })

  test('a limit of the wrong shape is left out, and a file that is not a reading gives nothing', () => {
    expect(parseShared(shared(NOW, [FABLE, { kind: 'model', percent: 3, resetsAt: null }, { kind: 'odd', percent: 3, resetsAt: null }, { kind: 'seven_day', percent: '30', resetsAt: null }]), NOW))
      .toEqual([FABLE])
    expect(parseShared('{"at":', NOW)).toEqual([])
    expect(parseShared(JSON.stringify({ limits: [FABLE] }), NOW)).toEqual([])
  })
})
