import { describe, expect, test } from 'claude-code/testing'

import { type StatusJson, FREE_CELLS, render, statusInput } from './statusline'
import type { Limit } from './usage'

const NOW = 1_792_162_404_000
const MIN = 60_000
const HOUR = 60 * MIN
// Claude Code sends its times in Unix seconds
const at = (ms: number) => (NOW + ms) / 1000
const JSON_IN: StatusJson = {
  workspace: { project_dir: '/home/me/plugins' },
  rate_limits: {
    five_hour: { used_percentage: 66, resets_at: at(46 * MIN) },
    seven_day: { used_percentage: 43, resets_at: at((3 * 24 + 21) * HOUR) },
  },
  prompt_cache: { warm: true, expires_at: at(52 * MIN) },
}
const FABLE: Limit = { kind: 'model', name: 'Fable', percent: 19, resetsAt: NOW + (5 * 24 + 1) * HOUR }
const LEFT = 'plugins (main)'
const FIVE_ROW = '5h ━━━╾╂─ 66%  behind  46m'
const SEVEN_ROW = '7d ━━╉─── 43% 3d21h'
// 28% of the week gone and 19% used: behind, the tick after cell 1
const FABLE_ROW = 'Fable ━╉──── 19%  behind  5d1h'
const RIGHT = `${FIVE_ROW} · ${SEVEN_ROW} · ${FABLE_ROW} · cache 52m`

const row = (json: StatusJson = JSON_IN, shared: readonly Limit[] = [FABLE], columns = 200) =>
  render(statusInput(json, { where: 'plugins', git: { branch: 'main', added: 0, changed: 0 }, shared, now: NOW }), columns)
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const cells = (s: string) => [...plain(s)].length
// the zones with the padding between them squeezed to one gap
const zones = (s: string) => plain(s).split(/ {3,}/)

describe('the status line row', () => {
  test("the repo and branch on the left; the reply's 5h and 7d, the shared model windows and the cache on the right", () => {
    expect(zones(row())).toEqual([LEFT, RIGHT])
  })

  test('the row fills the columns less the four cells Claude Code keeps free, so the right zone ends the row', () => {
    for (const columns of [120, 200]) expect(cells(row(JSON_IN, [FABLE], columns)), String(columns)).toBe(columns - FREE_CELLS)
  })

  test('the fit uses the columns less those four: one cell less drops the meters', () => {
    const exact = LEFT.length + 3 + [...RIGHT].length + FREE_CELLS
    expect(zones(row(JSON_IN, [FABLE], exact))).toEqual([LEFT, RIGHT])
    expect(zones(row(JSON_IN, [FABLE], exact - 1))[1]).toBe('5h 66%  behind  46m · 7d 43% 3d21h · Fable 19%  behind  5d1h · cache 52m')
  })

  test('the 5h and 7d come only from the reply; a shared 5h or 7d is not used', () => {
    const shared: Limit[] = [{ kind: 'five_hour', percent: 1, resetsAt: NOW + HOUR }, FABLE]
    expect(zones(row({ ...JSON_IN, rate_limits: undefined }, shared))).toEqual([LEFT, `${FABLE_ROW} · cache 52m`])
  })

  test('a percent that is not a number leaves its window out; a reset that is not a number shows no tick, word or countdown', () => {
    const json: StatusJson = { ...JSON_IN, rate_limits: { five_hour: { used_percentage: 'x', resets_at: at(HOUR) }, seven_day: { used_percentage: 43, resets_at: 'soon' } } }
    expect(zones(row(json, []))[1]).toBe('7d ━━─── 43% · cache 52m')
  })

  test('a cold cache, or one with no expiry, is left out', () => {
    for (const prompt_cache of [{ warm: false, expires_at: at(52 * MIN) }, { warm: true, expires_at: null }, undefined]) {
      expect(zones(row({ ...JSON_IN, prompt_cache }, []))[1], JSON.stringify(prompt_cache)).toBe(`${FIVE_ROW} · ${SEVEN_ROW}`)
    }
  })

  test('with nothing on the right, the row is the left zone alone, with no padding', () => {
    expect(row({}, [])).toBe(`plugins\x1b[1;34m (\x1b[0m\x1b[31mmain\x1b[0m\x1b[1;34m)\x1b[0m`)
  })

  test('a badge is bold black on its fixed color; dim runs are dim; the branch has the named colors; plain text has no escape', () => {
    const s = row()
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;86;180;233m behind \x1b[0m')
    expect(s).toContain('\x1b[2m · \x1b[0m')
    expect(s.startsWith('plugins\x1b[1;34m (\x1b[0m\x1b[31mmain\x1b[0m\x1b[1;34m)\x1b[0m')).toBe(true)
    expect(s).toContain('\x1b[0m66%')
    expect(s).not.toMatch(/\x1b\[[0-9;]*[1-9][0-9;]*m66%/)
  })

  test('a far ahead window and a context-free row: vermillion and orange badges keep black text', () => {
    const json: StatusJson = { rate_limits: { five_hour: { used_percentage: 99, resets_at: at(150 * MIN) }, seven_day: { used_percentage: 60, resets_at: at(96 * HOUR) } } }
    const s = row(json, [])
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;213;94;0m far ahead \x1b[0m')
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;230;159;0m ahead \x1b[0m')
  })
})
