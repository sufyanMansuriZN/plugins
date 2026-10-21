import { describe, expect, test } from 'claude-code/testing'

import { type BarInput, type Segment, type Window, GAP, SEP, folderName, modelLabel, parseGit, parseWindows, segments, stepTokens } from './bar'

const NOW = 1_792_162_404_000
const MIN = 60_000
const HOUR = 60 * MIN
const FIVE: Window = { label: '5h', percent: 66, resetsAt: NOW + 46 * MIN, length: 5 * HOUR }
const SEVEN: Window = { label: '7d', percent: 43, resetsAt: NOW + (3 * 24 + 21) * HOUR, length: 168 * HOUR }
// 5h: an even pace is at 84.7% with 46m left, so 66% (10.56 half cells, 11) is behind and the tick sits after cell 7;
// 7d: 44.6% with 3d21h left, so 43% (6.88 half cells, 7) is on pace and the tick sits after cell 4
const FIVE_ROW = '5h ━━━━━╾─╂─ 66%  behind  ↻46m'
const SEVEN_ROW = '7d ━━━╾╂──── 43% ↻3d21h'
const TICKS = '┃┠┣┨╂╊┫╉╋'
const LEFT = 'plugins · main +3 ~2 · Opus 5.5 1M'
const GAUGES = `ctx 6% · ${FIVE_ROW} · ${SEVEN_ROW}`
const WORDS = 'ctx 6% · 5h 66%  behind  ↻46m · 7d 43% ↻3d21h'
const BARE = 'ctx 6% · 5h 66% ↻46m · 7d 43% ↻3d21h'
const LONG = { branch: 'feature/a-very-long-branch-name', added: 1, changed: 0 }
const cells = (s: string) => [...s].length
// the row's width when both zones are drawn: the left, the gap, the right
const fitted = (left: string, right: string) => cells(left) + GAP + cells(right)

const input = (over: Partial<BarInput> = {}): BarInput => ({
  where: 'plugins',
  git: { branch: 'main', added: 3, changed: 2 },
  agent: null,
  model: 'Opus 5.5 1M',
  ctx: { kind: 'percent', percent: 6 },
  windows: [FIVE, SEVEN],
  now: NOW,
  resetMark: '↻',
  ...over,
})

const text = (segs: Segment[]) => segs.map(s => s.map(r => r.text).join('')).join(SEP)
const zones = (over: Partial<BarInput> = {}, columns = 500) => {
  const { left, right } = segments(input(over), columns)
  return [text(left), text(right)] as const
}
const right = (over: Partial<BarInput> = {}, columns = 500) => zones(over, columns)[1]
const runs = (over: Partial<BarInput>, columns = 500) => {
  const { left, right } = segments(input({ git: null, ...over }), columns)
  return [...left, ...right].flat()
}
const tone = (over: Partial<BarInput>, shown: string) => runs(over).find(r => r.text.trim() === shown)?.tone
const meter = (over: Partial<BarInput>) =>
  runs(over).filter(r => new RegExp(`^[━╾─${TICKS}]+$`).test(r.text)).map(r => [r.text, r.tone])
const badges = (over: Partial<BarInput>) => runs(over).filter(r => r.badge).map(r => [r.text, r.tone])

const five = (percent: number, resetsAt: number | null): Partial<BarInput> =>
  ({ windows: [{ ...FIVE, percent, resetsAt }] })
// half of 5h gone: an even pace stands at 50%, so the tick sits after cell 4
const half = (percent: number) => five(percent, NOW + 2.5 * HOUR)
const spend = (percent: number): Partial<BarInput> => ({ windows: [{ label: '$', percent, resetsAt: null, length: null }] })
const alone = (over: Partial<BarInput>) => right({ ctx: null, ...over })

describe('segments', () => {
  test('every segment has a value: where, git and the model on the left, the gauges on the right', () => {
    expect(zones()).toEqual([LEFT, GAUGES])
  })

  test('on pace: no word, and no cell or percent in color', () => {
    const over = { windows: [SEVEN] }
    expect(alone(over)).toBe(SEVEN_ROW)
    expect(badges(over)).toEqual([])
    expect(runs(over).some(r => r.tone !== 'plain' && r.tone !== 'dim')).toBe(false)
  })

  test('only the model is known', () => {
    expect(zones({ where: null, git: null, ctx: null, windows: [] })).toEqual(['Opus 5.5 1M', ''])
  })

  test('each part is left out without a value', () => {
    expect(zones({ git: null })).toEqual(['plugins · Opus 5.5 1M', GAUGES])
    expect(zones({ git: { branch: 'main', added: 0, changed: 0 } })).toEqual(['plugins · main · Opus 5.5 1M', GAUGES])
    expect(zones({ where: null })).toEqual(['main +3 ~2 · Opus 5.5 1M', GAUGES])
    expect(zones({ git: null, model: null })).toEqual(['plugins', GAUGES])
    expect(zones({ windows: [] })).toEqual([LEFT, 'ctx 6%'])
    expect(right({ windows: [SEVEN] })).toBe(`ctx 6% · ${SEVEN_ROW}`)
  })

  test('a cell fills in halves: a thick left half is half a cell', () => {
    expect(alone(spend(6))).toBe('$ ╾─────── 6%')
    expect(alone(spend(19))).toBe('$ ━╾────── 19%')
    expect(alone(spend(3))).toBe('$ ──────── 3%')
    expect(alone(spend(100))).toBe('$ ━━━━━━━━  100% ')
  })

  test('a spend limit has no tick and no word; its percent becomes a yellow badge at 50 and a red one at 80', () => {
    expect(right(spend(40.4))).toBe('ctx 6% · $ ━━━───── 40%')
    expect(alone(spend(50))).toBe('$ ━━━━────  50% ')
    expect(alone(spend(80))).toBe('$ ━━━━━━╾─  80% ')
    expect(meter(spend(40.4))).toEqual([['━━━', 'plain'], ['─────', 'dim']])
    expect(meter(spend(50))).toEqual([['━━━━', 'plain'], ['────', 'dim']])
    expect(meter(spend(80))).toEqual([['━━━━━━╾', 'plain'], ['─', 'dim']])
    for (const [percent, expected] of [[49, []], [50, [[' 50% ', 'yellow']]], [79, [[' 79% ', 'yellow']]], [80, [[' 80% ', 'red']]]] as const) {
      expect(badges(spend(percent)), String(percent)).toEqual(expected)
    }
    expect(tone(spend(49), '49%')).toBe('plain')
  })

  test('ahead: no cell in color, and an "ahead" badge follows the plain percent', () => {
    expect(alone(half(70))).toBe('5h ━━━━╋━╾── 70%  ahead  ↻2h30m')
    expect(meter(half(70))).toEqual([['━━━━╋━╾', 'plain'], ['──', 'dim']])
    expect(badges(half(70))).toEqual([[' ahead ', 'yellow']])
    expect(tone(half(70), '70%')).toBe('plain')
  })

  test('behind: no cell in color, and a "behind" badge', () => {
    expect(alone(half(30))).toBe('5h ━━╾─╂──── 30%  behind  ↻2h30m')
    expect(meter(half(30))).toEqual([['━━╾', 'plain'], ['─', 'dim'], ['╂', 'plain'], ['────', 'dim']])
    expect(badges(half(30))).toEqual([[' behind ', 'blue']])
    expect(tone(half(30), '30%')).toBe('plain')
  })

  test('on pace: a fill that stops at the tick has no heavy arm past it', () => {
    expect(alone(half(50))).toBe('5h ━━━━╉──── 50% ↻2h30m')
    expect(meter(half(50))).toEqual([['━━━━╉', 'plain'], ['────', 'dim']])
  })

  test('a half cell gives the tick a light arm on its left and a heavy arm on its right', () => {
    expect(alone(half(46)), 'half cell before the tick').toBe('5h ━━━╾╂──── 46% ↻2h30m')
    expect(alone(half(54)), 'half cell after the tick').toBe('5h ━━━━╋╾─── 54% ↻2h30m')
  })

  test('within 5 points of an even pace has no word; past 20 ahead, or used up, is red', () => {
    for (const [percent, expected] of [
      [55, []], [56, [[' ahead ', 'yellow']]], [45, []], [44, [[' behind ', 'blue']]],
      [70, [[' ahead ', 'yellow']]], [71, [[' far ahead ', 'red']]], [100, [[' used up ', 'red']]],
    ] as const) {
      expect(badges(half(percent)), `${percent}%`).toEqual(expected)
    }
    expect(alone(half(71))).toBe('5h ━━━━╋━╾── 71%  far ahead  ↻2h30m')
    expect(meter(half(71)), 'far ahead').toEqual([['━━━━╋━╾', 'plain'], ['──', 'dim']])
    expect(alone(half(100))).toBe('5h ━━━━╋━━━━ 100%  used up  ↻2h30m')
    expect(meter(half(100)), 'used up').toEqual([['━━━━╋━━━━', 'plain']])
  })

  test('color is only ever a badge background: no other run is in color, in any state', () => {
    const states: [string, Partial<BarInput>][] = [
      ['behind', half(30)], ['on', half(50)], ['ahead', half(56)], ['far ahead', half(71)], ['used up', half(100)],
      ['tick first', five(20, NOW + 5 * HOUR - 10 * MIN)], ['tick last', five(91, NOW + 10 * MIN)],
      ['spend 49', spend(49)], ['spend 50', spend(50)], ['spend 80', spend(80)], ['spend 100', spend(100)],
      ['no reset 80', { windows: [{ ...SEVEN, percent: 80, resetsAt: null }] }],
      ['ctx 70', { ctx: { kind: 'percent', percent: 70 } }], ['ctx 85', { ctx: { kind: 'percent', percent: 85 } }],
    ]
    for (const [name, over] of states) {
      const colored = runs(over).filter(r => !r.badge && r.tone !== 'plain' && r.tone !== 'dim')
      expect(colored, name).toEqual([])
    }
  })

  test('on pace, no cell is in color, even across the tick', () => {
    expect(meter(five(57, NOW + 138 * MIN)), 'mark at 54').toEqual([['━━━━╋╾', 'plain'], ['───', 'dim']])
    expect(meter(five(54, NOW + 126 * MIN)), 'mark at 58').toEqual([['━━━━╾╂', 'plain'], ['───', 'dim']])
  })

  test('the tick stands first at the start of a window and last near its reset', () => {
    expect(alone(five(20, NOW + 5 * HOUR - 10 * MIN))).toBe('5h ┣━╾────── 20%  ahead  ↻4h50m')
    expect(meter(five(20, NOW + 5 * HOUR - 10 * MIN))).toEqual([['┣━╾', 'plain'], ['──────', 'dim']])
    expect(alone(five(91, NOW + 10 * MIN)), 'an even pace is at 96.7%').toBe('5h ━━━━━━━╾┨ 91%  behind  ↻10m')
    expect(meter(five(91, NOW + 10 * MIN))).toEqual([['━━━━━━━╾┨', 'plain']])
  })

  test('the 7-day window has a pace around the clock too', () => {
    const seven = (percent: number) => ({ windows: [{ ...SEVEN, percent, resetsAt: NOW + 84 * HOUR }] })
    expect(alone(seven(80))).toBe('7d ━━━━╋━━╾─ 80%  far ahead  ↻3d12h')
    expect(meter(seven(80))).toEqual([['━━━━╋━━╾', 'plain'], ['─', 'dim']])
  })

  test('a window whose reset has passed is left out', () => {
    expect(right(five(88, NOW - 1))).toBe('ctx 6%')
  })

  test('the context percent becomes a yellow badge at 70% and a red one at 85%', () => {
    for (const [percent, expected] of [
      [69, []], [70, [[' 70% ', 'yellow']]], [84.4, [[' 84% ', 'yellow']]], [85, [[' 85% ', 'red']]],
    ] as const) {
      expect(badges({ ctx: { kind: 'percent', percent }, windows: [] }), String(percent)).toEqual(expected)
    }
    expect(tone({ ctx: { kind: 'percent', percent: 69 } }, '69%')).toBe('plain')
    expect(alone({ ctx: { kind: 'percent', percent: 85 }, windows: [] })).toBe('ctx  85% ')
  })

  test('no reset time badges the percent by share alone, with no tick, no word and no countdown', () => {
    for (const [percent, expected] of [[49, []], [50, [[' 50% ', 'yellow']]], [79, [[' 79% ', 'yellow']]], [80, [[' 80% ', 'red']]]] as const) {
      const over = { windows: [{ ...SEVEN, percent, resetsAt: null }] }
      expect(badges(over), String(percent)).toEqual(expected)
      expect(right(over)).not.toMatch(new RegExp(`[↻${TICKS}]`))
    }
  })

  test('countdowns use at most two units', () => {
    for (const [ms, shown] of [[30_000, '<1m'], [12 * MIN, '12m'], [2 * HOUR + 40 * MIN, '2h40m'], [4 * HOUR, '4h'], [31 * HOUR + 59_000, '1d7h'], [48 * HOUR, '2d']] as const) {
      expect(right(five(1, NOW + ms)).endsWith(`↻${shown}`), shown).toBe(true)
    }
  })

  test('a subagent: dim type and its model on the left, tokens in the default color on the right', () => {
    const over: Partial<BarInput> = { git: null, agent: 'Explore', model: 'Haiku 4.5', ctx: { kind: 'tokens', tokens: 42_000 } }
    expect(zones(over)).toEqual(['plugins · Explore · Haiku 4.5', `ctx 42K · ${FIVE_ROW} · ${SEVEN_ROW}`])
    expect(tone(over, 'Explore')).toBe('dim')
    expect(tone(over, '42K')).toBe('plain')
  })

  test('a narrow row drops the meters, then the words, while the left zone stays whole', () => {
    expect(zones({}, fitted(LEFT, GAUGES))).toEqual([LEFT, GAUGES])
    expect(zones({}, fitted(LEFT, GAUGES) - 1)).toEqual([LEFT, WORDS])
    expect(zones({}, fitted(LEFT, WORDS))).toEqual([LEFT, WORDS])
    expect(zones({}, fitted(LEFT, WORDS) - 1)).toEqual([LEFT, BARE])
    const words = segments(input(), fitted(LEFT, WORDS)).right.flat()
    expect(words.find(r => r.badge)?.tone, 'the word keeps its badge').toBe('blue')
  })

  test('a narrow row cuts the branch to 12 cells before it drops a meter', () => {
    const full = zones({ git: LONG })
    expect(zones({ git: LONG }, fitted(full[0], GAUGES))).toEqual(full)
    const kept = 'plugins · feature/a-v… · Opus 5.5 1M'
    expect(zones({ git: LONG }, fitted(kept, GAUGES))).toEqual([kept, GAUGES])
    expect(zones({ git: LONG }, fitted(kept, GAUGES) - 1)).toEqual(['plugins · feature/a-very-long-branch-nam… · Opus 5.5 1M', WORDS])
  })

  test('past the last step on the right, the branch is cut, then left out, then the name is cut', () => {
    const rest = 'plugins · Opus 5.5 1M'
    expect(zones({ git: LONG }, fitted(rest, BARE) + SEP.length + 2)).toEqual(['plugins · f… · Opus 5.5 1M', BARE])
    expect(zones({ git: LONG }, fitted(rest, BARE) + SEP.length + 1)).toEqual([rest, BARE])
    expect(zones({ git: LONG }, fitted(rest, BARE))).toEqual([rest, BARE])
    expect(zones({ git: LONG }, fitted('plu… · Opus 5.5 1M', BARE))).toEqual(['plu… · Opus 5.5 1M', BARE])
  })

  test('the gauges, the agent and the model are never cut', () => {
    expect(zones({}, 20)).toEqual(['Opus 5.5 1M', BARE])
    expect(zones({ agent: 'Explore', model: 'Haiku 4.5' }, 20)).toEqual(['Explore · Haiku 4.5', BARE])
  })

  test('with no gauges, the left zone has the whole row and no gap', () => {
    expect(zones({ git: LONG, ctx: null, windows: [] }, 26)).toEqual(['plugins · f… · Opus 5.5 1M', ''])
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

  test('a folder name is the last part of its path', () => {
    expect(folderName('/home/me/plugins')).toBe('plugins')
    expect(folderName('/home/me/plugins/')).toBe('plugins')
    expect(folderName('C:\\Users\\me\\plugins')).toBe('plugins')
    expect(folderName('/')).toBe('/')
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
