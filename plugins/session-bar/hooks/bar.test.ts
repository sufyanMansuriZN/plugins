import { describe, expect, test } from 'claude-code/testing'

import { type BarInput, type Segment, type Window, SEP, modelLabel, parseGit, parseWindows, segments, stepTokens } from './bar'

const NOW = 1_792_162_404_000
const MIN = 60_000
const HOUR = 60 * MIN
const FIVE: Window = { label: '5h', percent: 66, resetsAt: NOW + 46 * MIN, length: 5 * HOUR }
const SEVEN: Window = { label: '7d', percent: 43, resetsAt: NOW + (3 * 24 + 21) * HOUR, length: 168 * HOUR }
// 5h: even pace is at 84.7% with 46m left, so 66% is 56m behind; 7d: 44.6% with 3d21h left, so 43% is on pace
const FIVE_ROW = '5h ━━━━━─── 66% 56m behind ↻46m'
const SEVEN_ROW = '7d ━━━───── 43% on pace ↻3d21h'
const GAUGES = `Opus 5.5 1M · ctx 6% · ${FIVE_ROW} · ${SEVEN_ROW}`
const WORDS = 'Opus 5.5 1M · ctx 6% · 5h 66% 56m behind ↻46m · 7d 43% on pace ↻3d21h'
const BARE = 'Opus 5.5 1M · ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h'
const cells = (s: string) => [...s].length

const input = (over: Partial<BarInput> = {}): BarInput => ({
  git: { branch: 'main', added: 3, changed: 2 },
  agent: null,
  model: 'Opus 5.5 1M',
  ctx: { kind: 'percent', percent: 6 },
  windows: [FIVE, SEVEN],
  now: NOW,
  ...over,
})

const row = (over: Partial<BarInput> = {}, columns = 500) => text(segments(input(over), columns))
const text = (segs: Segment[]) => segs.map(s => s.map(r => r.text).join('')).join(SEP)
const tone = (over: Partial<BarInput>, shown: string) =>
  segments(input(over), 500).flat().find(r => r.text.trim() === shown)?.tone
const meter = (over: Partial<BarInput>) =>
  segments(input({ git: null, ...over }), 500).flat().filter(r => /^[━─]+$/.test(r.text)).map(r => [r.text, r.tone])

const five = (percent: number, resetsAt: number | null): Partial<BarInput> =>
  ({ windows: [{ ...FIVE, percent, resetsAt }] })
// half of 5h gone: an even pace stands at 50%, and each point is 3 minutes
const half = (percent: number) => five(percent, NOW + 2.5 * HOUR)

describe('segments', () => {
  test('every segment has a value', () => {
    expect(row()).toBe(`main +3 ~2 · ${GAUGES}`)
  })

  test('a calm row has no alert color', () => {
    const tones = segments(input(), 500).flat().map(r => r.tone)
    expect(tones.some(t => t === 'yellow' || t === 'red')).toBe(false)
  })

  test('only the model is known', () => {
    expect(row({ git: null, ctx: null, windows: [] })).toBe('Opus 5.5 1M')
  })

  test('each part is left out without a value', () => {
    expect(row({ git: null })).toBe(GAUGES)
    expect(row({ git: { branch: 'main', added: 0, changed: 0 } })).toBe(`main · ${GAUGES}`)
    expect(row({ git: null, model: null })).toBe(`ctx 6% · ${FIVE_ROW} · ${SEVEN_ROW}`)
    expect(row({ git: null, windows: [] })).toBe('Opus 5.5 1M · ctx 6%')
    expect(row({ git: null, windows: [SEVEN] })).toBe(`Opus 5.5 1M · ctx 6% · ${SEVEN_ROW}`)
  })

  test('a spend limit has a meter in its share color and no pace word', () => {
    const spend = (percent: number): Partial<BarInput> => ({ windows: [{ label: '$', percent, resetsAt: null, length: null }] })
    expect(row({ git: null, ...spend(40.4) })).toBe('Opus 5.5 1M · ctx 6% · $ ━━━───── 40%')
    expect(meter(spend(40.4))).toEqual([['━━━', 'plain'], ['─────', 'dim']])
    expect(meter(spend(80))).toEqual([['━━━━━━', 'red'], ['──', 'dim']])
  })

  test('each pace has its word and color', () => {
    for (const [percent, word, expected] of [
      [75, '1h15m ahead', 'red'],
      [60, '30m ahead', 'yellow'],
      [50, 'on pace', 'green'],
      [30, '1h behind', 'blue'],
      [100, 'used up', 'red'],
    ] as const) {
      expect(row({ git: null, model: null, ctx: null, ...half(percent) }), word).toContain(`${percent}% ${word} ↻2h30m`)
      expect(tone(half(percent), `${percent}%`), word).toBe(expected)
      expect(tone(half(percent), word), word).toBe(expected)
    }
  })

  test('within 5 points of an even pace is on pace; ahead turns red past 20', () => {
    for (const [percent, word, expected] of [
      [55, 'on pace', 'green'],
      [56, '18m ahead', 'yellow'],
      [45, 'on pace', 'green'],
      [44, '18m behind', 'blue'],
      [70, '1h ahead', 'yellow'],
      [71, '1h3m ahead', 'red'],
    ] as const) {
      expect(tone(half(percent), word), `${percent}%`).toBe(expected)
    }
  })

  test('near the reset, a high share can still be behind', () => {
    expect(tone(five(91, NOW + 10 * MIN), '17m behind')).toBe('blue')
  })

  test('the meter shows overspend past the even pace and allowance left before it', () => {
    expect(row({ git: null, model: null, ctx: null, ...half(75) })).toBe('5h ━━━━━━── 75% 1h15m ahead ↻2h30m')
    expect(meter(half(75)), 'far ahead').toEqual([['━━━━', 'plain'], ['━━', 'red'], ['──', 'dim']])
    expect(meter(half(60)), 'ahead').toEqual([['━━━━', 'plain'], ['━', 'yellow'], ['───', 'dim']])
    expect(meter(half(50)), 'on pace').toEqual([['━━━━', 'plain'], ['────', 'dim']])
    expect(meter(five(57, NOW + 138 * MIN)), 'on pace, a cell past the mark').toEqual([['━━━━━', 'plain'], ['───', 'dim']])
    expect(meter(five(54, NOW + 126 * MIN)), 'on pace, a cell short of it').toEqual([['━━━━', 'plain'], ['────', 'dim']])
    expect(meter(half(30)), 'behind').toEqual([['━━', 'plain'], ['──', 'blue'], ['────', 'dim']])
  })

  test('a window whose reset has passed is left out', () => {
    expect(row({ git: null, ...five(88, NOW - 1) })).toBe('Opus 5.5 1M · ctx 6%')
  })

  test('context marks at 70% and 85%', () => {
    for (const [percent, shown, expected] of [[69, '69%', 'plain'], [70, '70%', 'yellow'], [84.4, '84%', 'yellow'], [85, '85%', 'red']] as const) {
      expect(tone({ ctx: { kind: 'percent', percent } }, shown), String(percent)).toBe(expected)
    }
  })

  test('no reset time colors by share alone, with no pace word and no countdown', () => {
    for (const [percent, expected] of [[49, 'plain'], [50, 'yellow'], [79, 'yellow'], [80, 'red']] as const) {
      const over = { windows: [{ ...SEVEN, percent, resetsAt: null }] }
      expect(tone(over, `${percent}%`), String(percent)).toBe(expected)
      expect(row(over)).not.toMatch(/↻|ahead|behind|on pace|used up/)
    }
  })

  test('countdowns use at most two units', () => {
    for (const [ms, shown] of [[30_000, '<1m'], [12 * MIN, '12m'], [2 * HOUR + 40 * MIN, '2h40m'], [4 * HOUR, '4h'], [31 * HOUR + 59_000, '1d7h'], [48 * HOUR, '2d']] as const) {
      expect(row(five(1, NOW + ms)).endsWith(`↻${shown}`), shown).toBe(true)
    }
  })

  test('a subagent: dim type, its model, tokens in the default color', () => {
    const over: Partial<BarInput> = { git: null, agent: 'Explore', model: 'Haiku 4.5', ctx: { kind: 'tokens', tokens: 42_000 } }
    expect(row(over)).toBe(`Explore · Haiku 4.5 · ctx 42K · ${FIVE_ROW} · ${SEVEN_ROW}`)
    expect(tone(over, 'Explore')).toBe('dim')
    expect(tone(over, '42K')).toBe('plain')
  })

  test('a narrow row drops the meters, then the pace words', () => {
    expect(row({ git: null }, cells(GAUGES))).toBe(GAUGES)
    expect(row({ git: null }, cells(GAUGES) - 1)).toBe(WORDS)
    expect(row({ git: null }, cells(WORDS) - 1)).toBe(BARE)
  })

  test('a narrow row cuts git to 12 cells before it drops a meter', () => {
    const git = { branch: 'feature/a-very-long-branch-name', added: 1, changed: 0 }
    const full = row({ git })
    expect(row({ git }, cells(full))).toBe(full)
    expect(row({ git }, cells(GAUGES) + SEP.length + 12)).toBe(`feature/a-v… · ${GAUGES}`)
    expect(row({ git }, cells(GAUGES) + SEP.length + 11)).toBe(`feature/a-very-long-branch-n… · ${WORDS}`)
  })

  test('the gauges are never cut', () => {
    expect(row({}, 20)).toBe(BARE)
  })
})

describe('boundary parsing', () => {
  test('rate limits by kind, in table order, others ignored', () => {
    const resets = new Date(NOW + 46 * MIN).toISOString()
    expect(parseWindows([
      { kind: 'seven_day', percentUsed: 43 },
      { kind: 'weekly_opus', percentUsed: 12 },
      { kind: 'five_hour', percentUsed: 66, resetsAt: resets },
    ])).toEqual([
      { label: '5h', percent: 66, resetsAt: NOW + 46 * MIN, length: 5 * HOUR },
      { label: '7d', percent: 43, resetsAt: null, length: 168 * HOUR },
    ])
  })

  test('a percent that is not a number leaves the window out; a reset that does not parse is none', () => {
    expect(parseWindows([{ kind: 'five_hour', percentUsed: NaN }])).toEqual([])
    expect(parseWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: 'soon' }]))
      .toEqual([{ label: '5h', percent: 20, resetsAt: null, length: 5 * HOUR }])
  })

  test('step tokens are the input sides summed', () => {
    const usage = { model: 'm', input_tokens: 2_000, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 10_000, output_tokens: 500 }
    expect(stepTokens(usage)).toBe(42_000)
    expect(stepTokens({ ...usage, input_tokens: NaN })).toBe(null)
  })

  test('git counts', () => {
    const porcelain = [
      '# branch.oid 0123456789abcdef',
      '# branch.head main',
      '1 A. N... 100644 100644 100644 a b new.py',
      '1 .M N... 100644 100644 100644 a b edited.py',
      '1 D. N... 100644 000000 000000 a b gone.py',
      '2 R. N... 100644 100644 100644 a b R100 to.py\tfrom.py',
      '? untracked.txt',
    ].join('\n')
    expect(parseGit(porcelain)).toEqual({ branch: 'main', added: 2, changed: 3 })
  })

  test('detached HEAD shows the short sha, or HEAD with none', () => {
    expect(parseGit('# branch.oid 0123456789abcdef\n# branch.head (detached)\n')?.branch).toBe('0123456')
    expect(parseGit('# branch.oid (initial)\n# branch.head (detached)\n')?.branch).toBe('HEAD')
  })

  test('not status output', () => {
    expect(parseGit('')).toBe(null)
  })
})

describe('modelLabel', () => {
  test('labels', () => {
    expect(modelLabel('claude-opus-5-5', 1_000_000)).toBe('Opus 5.5 1M')
    expect(modelLabel('claude-opus-5-5', 200_000)).toBe('Opus 5.5 200K')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
    expect(modelLabel('claude-opus-5-5[1m]', 1_000_000)).toBe('Opus 5.5 1M')
    expect(modelLabel('my-gateway-model', 1_000_000)).toBe('my-gateway-model')
  })
})
