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
  model: { id: 'claude-opus-5-5' },
  context_window: { total_input_tokens: 60_000, context_window_size: 1_000_000 },
  rate_limits: {
    five_hour: { used_percentage: 66, resets_at: at(46 * MIN) },
    seven_day: { used_percentage: 43, resets_at: at((3 * 24 + 21) * HOUR) },
  },
  prompt_cache: { warm: true, expires_at: at(52 * MIN) },
}
const FABLE: Limit = { kind: 'model', name: 'Fable', percent: 19, resetsAt: NOW + (5 * 24 + 1) * HOUR }
const LEFT = 'plugins (main) · Opus 5.5 1M'
// 60K of 1M: half a cell used, the 250K tick after cell 1
const CTX_ROW = 'ctx ╾╂──── 60K'
const FIVE_ROW = '5h ━━━╾╂─ 66%  behind  46m'
const SEVEN_ROW = '7d ━━╉─── 43% 3d21h'
// 28% of the week gone and 19% used: behind, the tick after cell 1
const FABLE_ROW = 'Fable ━╉──── 19%  behind  5d1h'
const RIGHT = `cache 52m · ${CTX_ROW} · ${FIVE_ROW} · ${SEVEN_ROW} · ${FABLE_ROW}`

const row = (json: StatusJson = JSON_IN, shared: readonly Limit[] = [FABLE], columns = 200) =>
  render(statusInput(json, { where: 'plugins', git: { branch: 'main', added: 0, changed: 0 }, shared, now: NOW }), columns)
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const cells = (s: string) => [...plain(s)].length
// the zones with the padding between them squeezed to one gap
const zones = (s: string) => plain(s).split(/ {3,}/)

describe('the status line row', () => {
  test("the repo, branch and main model on the left; the cache, the main context, the reply's 5h and 7d and the shared model windows on the right", () => {
    expect(zones(row())).toEqual([LEFT, RIGHT])
  })

  test('the row fills the columns less the four cells Claude Code keeps free, so the right zone ends the row', () => {
    for (const columns of [140, 200]) expect(cells(row(JSON_IN, [FABLE], columns)), String(columns)).toBe(columns - FREE_CELLS)
  })

  test('the fit uses the columns less those four: one cell less drops the meters', () => {
    const exact = [...LEFT].length + 3 + [...RIGHT].length + FREE_CELLS
    expect(zones(row(JSON_IN, [FABLE], exact))).toEqual([LEFT, RIGHT])
    expect(zones(row(JSON_IN, [FABLE], exact - 1))[1]).toBe('cache 52m · ctx 60K · 5h 66%  behind  46m · 7d 43% 3d21h · Fable 19%  behind  5d1h')
  })

  test('the model label carries the window size; a 200K window gets its own tick at 160K', () => {
    const json: StatusJson = { model: { id: 'claude-sonnet-5-5' }, context_window: { total_input_tokens: 170_000, context_window_size: 200_000 } }
    expect(zones(row(json, []))).toEqual(['plugins (main) · Sonnet 5.5 200K', 'ctx ━━━━╋╾  170K '])
  })

  test('before the first reply the context is 0 and is left out; with no model id the model is left out', () => {
    expect(zones(row({ ...JSON_IN, context_window: { total_input_tokens: 0, context_window_size: 1_000_000 } }, []))[1])
      .toBe(`cache 52m · ${FIVE_ROW} · ${SEVEN_ROW}`)
    expect(zones(row({ ...JSON_IN, model: undefined }, []))[0]).toBe('plugins (main)')
  })

  test('the 5h and 7d come only from the reply; a shared 5h or 7d is not used', () => {
    const shared: Limit[] = [{ kind: 'five_hour', percent: 1, resetsAt: NOW + HOUR }, FABLE]
    expect(zones(row({ ...JSON_IN, rate_limits: undefined }, shared))[1]).toBe(`cache 52m · ${CTX_ROW} · ${FABLE_ROW}`)
  })

  test('a percent that is not a number leaves its window out; a reset that is not a number shows no tick, word or countdown', () => {
    const json: StatusJson = { ...JSON_IN, rate_limits: { five_hour: { used_percentage: 'x', resets_at: at(HOUR) }, seven_day: { used_percentage: 43, resets_at: 'soon' } } }
    expect(zones(row(json, []))[1]).toBe(`cache 52m · ${CTX_ROW} · 7d ━━─── 43%`)
  })

  test('a cold cache, or one with no expiry, is left out', () => {
    for (const prompt_cache of [{ warm: false, expires_at: at(52 * MIN) }, { warm: true, expires_at: null }, undefined]) {
      expect(zones(row({ ...JSON_IN, prompt_cache }, []))[1], JSON.stringify(prompt_cache)).toBe(`${CTX_ROW} · ${FIVE_ROW} · ${SEVEN_ROW}`)
    }
  })

  test('with nothing on the right, the row is the left zone alone, with no padding', () => {
    expect(row({}, [])).toBe(`plugins\x1b[1;34m (\x1b[0m\x1b[31mmain\x1b[0m\x1b[1;34m)\x1b[0m`)
  })

  test('a badge is bold black on its fixed color; the branch has the named colors; plain and dim text have no escape, as dim on the line\'s grey is too faint', () => {
    const s = row()
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;86;180;233m behind \x1b[0m')
    expect(s).not.toContain('\x1b[2m')
    expect(s).toContain(' 46m · 7d ')
    expect(s.startsWith('plugins\x1b[1;34m (\x1b[0m\x1b[31mmain\x1b[0m\x1b[1;34m)\x1b[0m · Opus 5.5 1M')).toBe(true)
    expect(s).toContain('5h ━━━╾╂─ 66% ')
  })

  test('far ahead, ahead and a context past its tick: vermillion and orange badges keep black text', () => {
    const json: StatusJson = {
      context_window: { total_input_tokens: 300_000, context_window_size: 1_000_000 },
      rate_limits: { five_hour: { used_percentage: 99, resets_at: at(150 * MIN) }, seven_day: { used_percentage: 60, resets_at: at(96 * HOUR) } },
    }
    const s = row(json, [])
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;213;94;0m 300K \x1b[0m')
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;213;94;0m far ahead \x1b[0m')
    expect(s).toContain('\x1b[1;38;2;0;0;0;48;2;230;159;0m ahead \x1b[0m')
  })
})
