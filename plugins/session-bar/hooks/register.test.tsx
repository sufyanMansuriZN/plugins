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
const LONG_BRANCH = '# branch.oid 0123456789abcdef\n# branch.head feature/a-very-long-branch-name\n? new.txt\n'
const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 60_000, window: 1_000_000, percent: 6 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 66, resetsAt: new Date(NOW + 46 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 43, resetsAt: new Date(NOW + (3 * 24 + 21) * 60 * MIN).toISOString() },
  ],
}
const WINDOWS = '5h ━━━━━╾─╂─ 66%  behind  46m · 7d ━━━╾╂──── 43% 3d21h'
// 60K of a 1M window: half a cell used, and the tick for 250K after cell 2
const CTX = 'ctx ╾─╂────── 60K'
const context = (tokens: number, window: number): SessionUsage => ({ ...USAGE, context: { tokens, window, percent: Math.round((tokens / window) * 100) } })
const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const cells = (s: string) => [...s].length
// a worktree of the repo: the repo's root is the main working tree, not the session's directory
const ROOT = '/home/me/plugins/.claude/worktrees/feat-x'
const WORKTREES = 'worktree /home/me/plugins\nHEAD 0123\nbranch refs/heads/main\n\nworktree /home/me/plugins/.claude/worktrees/feat-x\nHEAD 0123\nbranch refs/heads/feat-x\n'
// a Bash call's `cd` took the shell out of the repo
const SHELL = '/tmp/scratch'

// worktrees: `git worktree list` in the session's root; null outside a repo
type Setup = { porcelain?: string; usage?: SessionUsage; worktrees?: string | null | Error; place?: { root: string } }

const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// the engine beneath the plugin: a session in a worktree of repo `plugins` on `main`, two subagents,
// one of them yet to make a request
const engine = async ($: Engine, on: On, { porcelain = PORCELAIN, usage = USAGE, worktrees = WORKTREES, place = { root: ROOT } }: Setup = {}) => {
  const clock = mock.clock(on, { now: NOW })
  on('ui.render', () => h('Box', {}) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: place.root }))
  on('session.cwd', () => ({ value: SHELL }))
  on('session.repo', () => ({ value: null }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: usage }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('process.run', (_, e) => {
    if (e.init?.cwd !== ROOT || worktrees === null) return ran(128, '')
    if (!e.argv.includes('worktree')) return ran(0, porcelain)
    if (worktrees instanceof Error) throw worktrees
    return ran(0, worktrees)
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
  await $.session.start({ source: 'startup', cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
  return clock
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

test("main view, the shell elsewhere: the session root's repo, git and the main model on the left; context and the windows on the right", async ($, on) => {
  await engine($, on)
  for (const surface of SURFACES) {
    const { left, right } = await zonesOn($, surface)
    expect([left, right], surface).toEqual(['plugins (main +3 ~2) · Opus 5.5 1M', `${CTX} · ${WINDOWS}`])
  }
})

test('a 200K window: the context meter fills over 200K, its tick for 160K after cell 6', async ($, on) => {
  await engine($, on, { usage: context(120_000, 200_000) })
  for (const surface of SURFACES) {
    const { left, right } = await zonesOn($, surface)
    expect([left, right], surface).toEqual(['plugins (main +3 ~2) · Opus 5.5 200K', `ctx ━━━━━─╂── 120K · ${WINDOWS}`])
  }
})

for (const [tokens, window, shown, badge] of [
  [249_000, 1_000_000, 'ctx ━━╉────── 249K', null], [250_000, 1_000_000, 'ctx ━━╉──────  250K ', ' 250K '],
  [300_000, 1_000_000, 'ctx ━━╋╾─────  300K ', ' 300K '],
  [159_000, 200_000, 'ctx ━━━━━━╋╾─ 159K', null], [160_000, 200_000, 'ctx ━━━━━━╋╾─  160K ', ' 160K '],
  [170_000, 200_000, 'ctx ━━━━━━╋━─  170K ', ' 170K '],
] as const) {
  test(`${tokens / 1000}K of ${window / 1000}K: ${badge ? 'a vermillion badge from the tick' : 'plain below the tick'}`, async ($, on) => {
    await engine($, on, { usage: context(tokens, window) })
    for (const surface of SURFACES) {
      const ui = await mountBand($, surface)
      const right = (await ui.find({ type: 'Box', key: 'right' }))?.text
      const ctx = await ui.find({ type: 'Text', text: new RegExp(`^ ?${tokens / 1000}K ?$`) })
      await ui.unmount()
      expect(right, surface).toBe(`${shown} · ${WINDOWS}`)
      expect([ctx?.text, ctx?.props.backgroundColor, ctx?.props.color], surface)
        .toEqual(badge ? [badge, '#D55E00', '#000000'] : [`${tokens / 1000}K`, undefined, undefined])
    }
  })
}

test("outside a git repo, the left zone starts with the session root's directory name", async ($, on) => {
  await engine($, on, { worktrees: null })
  for (const surface of SURFACES) {
    expect((await zonesOn($, surface)).left, surface).toBe('feat-x · Opus 5.5 1M')
  }
})

test('a `/cd` out of the repo: the next redraw reads the new root, with no event and no tick', async ($, on) => {
  const place = { root: ROOT }
  await engine($, on, { place })
  place.root = '/tmp'
  expect((await zonesOn($, 'terminal')).left).toBe('tmp · Opus 5.5 1M')
})

test('a repo that cannot be read leaves the name out', async ($, on) => {
  await engine($, on, { worktrees: new Error('git timed out') })
  expect((await zonesOn($, 'terminal')).left).toBe('main +3 ~2 · Opus 5.5 1M')
})

test('a subagent in view after a Haiku step: its type and model on the left, its tokens on the right, no main model', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  for (const surface of SURFACES) {
    const { left, right } = await zonesOn($, surface, 'a1')
    expect([left, right], surface).toEqual(['plugins (main +3 ~2) · Explore · Haiku 4.5', `ctx 42K · ${WINDOWS}`])
  }
  expect((await zonesOn($, 'terminal')).left).toBe('plugins (main +3 ~2) · Opus 5.5 1M')
})

test('a subagent with no step yet: its type, no model and no context', async ($, on) => {
  await engine($, on)
  await step($, 'a1', 'claude-haiku-4-5-20251001')
  await step($, undefined, 'claude-fable-5-1')
  for (const surface of SURFACES) {
    const { left, right } = await zonesOn($, surface, 'a2')
    expect([left, right], surface).toEqual(['plugins (main +3 ~2) · Plan', WINDOWS])
  }
})

test('a row at exactly its width keeps every part, and its zones and gap add up to the band', async ($, on) => {
  await engine($, on)
  for (const surface of SURFACES) {
    const wide = await zonesOn($, surface)
    const columns = cells(wide.left!) + 3 + cells(wide.right!)
    const exact = await zonesOn($, surface, undefined, columns)
    expect(exact, surface).toEqual(wide)
    expect(cells(exact.left!) + Number(exact.gap) + cells(exact.right!), surface).toBe(columns)
    expect((await zonesOn($, surface, undefined, columns - 1)).right, surface).not.toBe(wide.right)
  }
})

test('a narrow band drops the meters, then the words, then cuts the branch, then the repo name', async ($, on) => {
  await engine($, on, { porcelain: LONG_BRANCH })
  for (const surface of SURFACES) {
    const meters = `${CTX} · ${WINDOWS}`
    const words = 'ctx 60K · 5h 66%  behind  46m · 7d 43% 3d21h'
    const bare = 'ctx 60K · 5h 66% 46m · 7d 43% 3d21h'
    const kept = 'plugins (feature/a-v…) · Opus 5.5 1M'
    const at = async (left: string, right: string) => {
      const { left: l, right: r } = await zonesOn($, surface, undefined, cells(left) + 3 + cells(right))
      return [l, r]
    }
    expect(await at(kept, meters), `${surface} branch cut to 12`).toEqual([kept, meters])
    expect(await at(kept, words), `${surface} meters off`).toEqual([kept, words])
    expect(await at(kept, bare), `${surface} words off`).toEqual([kept, bare])
    expect(await at('plugins (f…) · Opus 5.5 1M', bare), `${surface} branch cut`).toEqual(['plugins (f…) · Opus 5.5 1M', bare])
    expect(await at('plugins · Opus 5.5 1M', bare), `${surface} branch left out`).toEqual(['plugins · Opus 5.5 1M', bare])
    expect(await at('plu… · Opus 5.5 1M', bare), `${surface} name cut`).toEqual(['plu… · Opus 5.5 1M', bare])
    expect(await at('', bare), `${surface} never the model or a gauge`).toEqual(['Opus 5.5 1M', bare])
  }
})

test('a badge is black bold text on its Okabe-Ito color; the percent stays plain, and a tick on the unused track is dim', async ($, on) => {
  await engine($, on)
  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)
    const props = async (text: string) => (await ui.find({ type: 'Text', text }))?.props
    const behind = await props(' behind ')
    expect([behind?.backgroundColor, behind?.color, behind?.bold], surface).toEqual(['#56B4E9', '#000000', true])
    for (const plain of ['66%', '43%']) {
      const p = await props(plain)
      expect([p?.color, p?.backgroundColor, p?.dimColor], `${surface} ${plain}`).toEqual([undefined, undefined, undefined])
    }
    const tick = await props('╂')
    expect([tick?.color, tick?.backgroundColor, tick?.dimColor], `${surface} tick`).toEqual([undefined, undefined, true])
    await ui.unmount()
  }
})

test('a fixed color is only a badge background: ahead, far ahead, the spend percent and the context tokens; only the branch and its parentheses have a named color, on the terminal', async ($, on) => {
  await engine($, on, { usage: {
    ...USAGE,
    context: { tokens: 850_000, window: 1_000_000, percent: 85 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 70, resetsAt: new Date(NOW + 150 * MIN).toISOString() },
      { kind: 'seven_day', percentUsed: 80, resetsAt: new Date(NOW + 84 * 60 * MIN).toISOString() },
      { kind: 'spend_limit', percentUsed: 50 },
    ],
  } })
  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)
    const colors = async (text: string) => {
      const p = (await ui.find({ type: 'Text', text: new RegExp(`^${text}$`) }))?.props
      return [p?.backgroundColor, p?.color, p?.bold]
    }
    expect(await colors(' 850K '), `${surface} context`).toEqual(['#D55E00', '#000000', true])
    expect(await colors(' ahead '), surface).toEqual(['#E69F00', '#000000', true])
    expect(await colors(' far ahead '), surface).toEqual(['#D55E00', '#000000', true])
    expect(await colors(' 50% '), `${surface} spend`).toEqual(['#E69F00', '#000000', true])
    const texts = await ui.findAll({ type: 'Text' })
    const inColor = texts.filter(t => t.props.color !== undefined && t.props.color !== '#000000').map(t => t.text)
    expect(inColor, `${surface} text in color`).toEqual(surface === 'terminal' ? [' (', 'main', ')'] : [])
    const bare = texts.filter(t => t.props.color === '#000000' && !t.props.backgroundColor).map(t => t.text)
    expect(bare, `${surface} black text without a badge`).toEqual([])
    await ui.unmount()
  }
})

test("the terminal draws the branch and its parentheses in robbyrussell's named colors, the repo name and counts plain; the desktop draws them plain, with dim parentheses", async ($, on) => {
  await engine($, on)
  const drawn = async (surface: Surface) => {
    const ui = await mountBand($, surface)
    const left = await ui.find({ type: 'Box', key: 'left' })
    const texts = await ui.findAll({ type: 'Text' })
    await ui.unmount()
    return texts.slice(0, 5).map(t => [t.text, t.props.color ?? null, t.props.bold ?? null, t.props.dimColor ?? null]).concat([[left?.text ?? null]])
  }
  expect(await drawn('terminal')).toEqual([
    ['plugins', null, null, null], [' (', 'blue', true, null], ['main', 'red', null, null], [' +3 ~2', null, null, null], [')', 'blue', true, null],
    ['plugins (main +3 ~2) · Opus 5.5 1M'],
  ])
  expect(await drawn('desktop')).toEqual([
    ['plugins', null, null, null], [' (', null, null, true], ['main', null, null, null], [' +3 ~2', null, null, null], [')', null, null, true],
    ['plugins (main +3 ~2) · Opus 5.5 1M'],
  ])
})

test('a band left open redraws its countdowns every 30 seconds', async ($, on) => {
  const clock = await engine($, on)
  const ui = await mountBand($, 'terminal')
  const fiveHour = async () => (await ui.find({ type: 'Text', text: /^ \d+m$/ }))?.text
  const before = await fiveHour()
  await clock.advance(29_000)
  const early = await fiveHour()
  await clock.advance(2 * MIN)
  const after = await fiveHour()
  await ui.unmount()
  // the last tick inside 149 s is at 120 s, so the band shows 46m less two minutes
  expect([before, early, after]).toEqual([' 46m', ' 46m', ' 44m'])
})

test("rows another hook draws in the band sit above the bar, so the bar stays on the prompt", async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>3 tasks (1 done, 2 open)</Text>
  })
  await engine($, on)
  const ui = await mountBand($, 'terminal')
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  await ui.unmount()
  expect(texts[0]).toBe('3 tasks (1 done, 2 open)')
  expect(texts.slice(1).join('')).toMatch(/^plugins/)
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
