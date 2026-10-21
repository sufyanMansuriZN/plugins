import { describe, expect, test } from 'claude-code/testing'

import { type BarInput, type Segment, type Window, SEP, modelLabel, parseGit, parseWindows, segments, stepTokens } from './bar'

const NOW = 1_792_162_404_000
const MIN = 60_000
const HOUR = 60 * MIN
const FIVE: Window = { label: '5h', percent: 66, resetsAt: NOW + 46 * MIN, length: 5 * HOUR }
const SEVEN: Window = { label: '7d', percent: 43, resetsAt: NOW + (3 * 24 + 21) * HOUR, length: 168 * HOUR }
// 5h: an even pace is at 84.7% with 46m left, so 66% is behind and the tick sits after cell 7;
// 7d: 44.6% with 3d21h left, so 43% is on pace and the tick sits after cell 4
const FIVE_ROW = '5h ━━━━━──╂─ 66% ↻46m'
const SEVEN_ROW = '7d ━━━─╂──── 43% ↻3d21h'
const TICKS = '┃┠┣┨╂╊┫╉╋'
const GAUGES = `Opus 5.5 1M · ctx 6% · ${FIVE_ROW} · ${SEVEN_ROW}`
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
  segments(input({ git: null, ...over }), 500).flat().filter(r => new RegExp(`^[━─${TICKS}]+$`).test(r.text)).map(r => [r.text, r.tone])

const five = (percent: number, resetsAt: number | null): Partial<BarInput> =>
  ({ windows: [{ ...FIVE, percent, resetsAt }] })
// half of 5h gone: an even pace stands at 50%, so the tick sits after cell 4
const half = (percent: number) => five(percent, NOW + 2.5 * HOUR)
const alone = (over: Partial<BarInput>) => row({ git: null, model: null, ctx: null, ...over })

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

  test('a spend limit has 8 cells in its share color and no tick', () => {
    const spend = (percent: number): Partial<BarInput> => ({ windows: [{ label: '$', percent, resetsAt: null, length: null }] })
    expect(row({ git: null, ...spend(40.4) })).toBe('Opus 5.5 1M · ctx 6% · $ ━━━───── 40%')
    expect(meter(spend(40.4))).toEqual([['━━━', 'plain'], ['─────', 'dim']])
    expect(meter(spend(80))).toEqual([['━━━━━━', 'red'], ['──', 'dim']])
  })

  test('the tick marks an even pace; overspend past it is yellow, allowance before it blue', () => {
    expect(alone(half(70))).toBe('5h ━━━━╋━━── 70% ↻2h30m')
    expect(meter(half(70)), 'ahead').toEqual([['━━━━╋', 'plain'], ['━━', 'yellow'], ['──', 'dim']])
    expect(tone(half(70), '70%')).toBe('yellow')
    expect(alone(half(30))).toBe('5h ━━──╂──── 30% ↻2h30m')
    expect(meter(half(30)), 'behind').toEqual([['━━', 'plain'], ['──', 'blue'], ['╂', 'plain'], ['────', 'dim']])
    expect(tone(half(30), '30%')).toBe('blue')
    expect(alone(half(50)), 'a fill that stops at the tick has no heavy arm past it').toBe('5h ━━━━╉──── 50% ↻2h30m')
    expect(meter(half(50)), 'on pace').toEqual([['━━━━╉', 'plain'], ['────', 'dim']])
    expect(tone(half(50), '50%')).toBe('green')
  })

  test('the main row: behind, with two blue cells before the tick', () => {
    expect(meter({}).slice(0, 4)).toEqual([['━━━━━', 'plain'], ['──', 'blue'], ['╂', 'plain'], ['─', 'dim']])
    expect(tone({}, '66%')).toBe('blue')
    expect(tone({}, '43%')).toBe('green')
  })

  test('within 5 points of an even pace is on pace; ahead turns red past 20 or used up', () => {
    for (const [percent, expected] of [
      [55, 'green'], [56, 'yellow'], [45, 'green'], [44, 'blue'], [70, 'yellow'], [71, 'red'], [100, 'red'],
    ] as const) {
      expect(tone(half(percent), `${percent}%`), `${percent}%`).toBe(expected)
    }
    expect(meter(half(71)), 'far ahead').toEqual([['━━━━╋', 'plain'], ['━━', 'red'], ['──', 'dim']])
    expect(meter(half(100)), 'used up').toEqual([['━━━━╋', 'plain'], ['━━━━', 'red']])
  })

  test('on pace, no cell is yellow, red or blue, even across the tick', () => {
    expect(meter(five(57, NOW + 138 * MIN)), 'mark at 54').toEqual([['━━━━╋━', 'plain'], ['───', 'dim']])
    expect(meter(five(54, NOW + 126 * MIN)), 'mark at 58').toEqual([['━━━━', 'plain'], ['─', 'dim'], ['╂', 'plain'], ['───', 'dim']])
  })

  test('the tick stands first at the start of a window and last near its reset', () => {
    expect(alone(five(20, NOW + 5 * HOUR - 10 * MIN))).toBe('5h ┣━━────── 20% ↻4h50m')
    expect(meter(five(20, NOW + 5 * HOUR - 10 * MIN))).toEqual([['┣', 'plain'], ['━━', 'yellow'], ['──────', 'dim']])
    expect(alone(five(91, NOW + 10 * MIN))).toBe('5h ━━━━━━━─┨ 91% ↻10m')
    expect(meter(five(91, NOW + 10 * MIN))).toEqual([['━━━━━━━', 'plain'], ['─', 'blue'], ['┨', 'plain']])
    expect(tone(five(91, NOW + 10 * MIN), '91%'), 'an even pace is at 96.7%').toBe('blue')
  })

  test('the 7-day window has a pace around the clock too', () => {
    const seven = (percent: number) => ({ windows: [{ ...SEVEN, percent, resetsAt: NOW + 84 * HOUR }] })
    expect(alone(seven(80))).toBe('7d ━━━━╋━━── 80% ↻3d12h')
    expect(meter(seven(80))).toEqual([['━━━━╋', 'plain'], ['━━', 'red'], ['──', 'dim']])
  })

  test('a window whose reset has passed is left out', () => {
    expect(row({ git: null, ...five(88, NOW - 1) })).toBe('Opus 5.5 1M · ctx 6%')
  })

  test('context marks at 70% and 85%', () => {
    for (const [percent, shown, expected] of [[69, '69%', 'plain'], [70, '70%', 'yellow'], [84.4, '84%', 'yellow'], [85, '85%', 'red']] as const) {
      expect(tone({ ctx: { kind: 'percent', percent } }, shown), String(percent)).toBe(expected)
    }
  })

  test('no reset time colors by share alone, with no tick and no countdown', () => {
    for (const [percent, expected] of [[49, 'plain'], [50, 'yellow'], [79, 'yellow'], [80, 'red']] as const) {
      const over = { windows: [{ ...SEVEN, percent, resetsAt: null }] }
      expect(tone(over, `${percent}%`), String(percent)).toBe(expected)
      expect(row(over)).not.toMatch(new RegExp(`[↻${TICKS}]`))
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

  test('a narrow row drops the meters', () => {
    expect(row({ git: null }, cells(GAUGES))).toBe(GAUGES)
    expect(row({ git: null }, cells(GAUGES) - 1)).toBe(BARE)
    const bare = segments(input({ git: null }), cells(BARE)).flat()
    expect(bare.find(r => r.text === '66%')?.tone, 'the bare percent keeps its pace color').toBe('blue')
  })

  test('a narrow row cuts git to 12 cells before it drops a meter', () => {
    const git = { branch: 'feature/a-very-long-branch-name', added: 1, changed: 0 }
    const full = row({ git })
    expect(row({ git }, cells(full))).toBe(full)
    expect(row({ git }, cells(GAUGES) + SEP.length + 12)).toBe(`feature/a-v… · ${GAUGES}`)
    expect(row({ git }, cells(GAUGES) + SEP.length + 11)).toBe(`feature/a-very-long-branch-nam… · ${BARE}`)
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
