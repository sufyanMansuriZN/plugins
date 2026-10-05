import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type {
  CommandSpec,
  ModelCompleteRequest,
  ModelCompleteResult,
  On,
  PromptEditInput,
  PromptEditResult,
  PromptFillInput,
  PromptFillResult,
  PromptSubmitInput,
  SessionMessage,
} from 'claude-code'

import {
  CHORD_ACTION,
  INSTRUCTION_CHARS,
  LABEL_DISMISS,
  LABEL_OFF,
  LABEL_POLISH,
  LABEL_POLISHED,
  LABEL_RESTORE,
  LEAD_BUSY,
  RECENT_ROWS,
  added,
  buildPrompt,
  clean,
  polishable,
  preserves,
  spans,
  trimContext,
  withinLength,
} from './register'

// ---------------------------------------------------------------------------
// polishable
// ---------------------------------------------------------------------------

describe('polishable', () => {
  test('"yes, go ahead" is not offered', async () => {
    expect(polishable('yes, go ahead')).toBe(false)
    expect(polishable('yes, go ahead, please do it and continue')).toBe(false)
  })

  test('"haan kar do" is not offered', async () => {
    expect(polishable('haan kar do')).toBe(false)
    expect(polishable('haan bhai theek hai kar do chalo')).toBe(false)
  })

  test('a 5-word task is not offered', async () => {
    expect(polishable('fix the login redirect bug')).toBe(false)
  })

  test('a 7-word task is offered', async () => {
    expect(polishable('fix the login redirect bug in prod')).toBe(true)
  })

  test('a /command or ! line is not offered', async () => {
    expect(polishable('/foo bar baz qux quux corge grault')).toBe(false)
    expect(polishable('!ls -la the whole directory tree please')).toBe(false)
    expect(polishable('/foo bar\nfix the login redirect bug in prod')).toBe(true)
  })

  test('an empty box is not offered', async () => {
    expect(polishable('')).toBe(false)
    expect(polishable('   ')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// spans / preserves
// ---------------------------------------------------------------------------

describe('spans', () => {
  const original = [
    'the parser in src/foo/bar.ts calls parseDate twice, see `toIsoString` and',
    'https://example.com/docs/dates?x=1 for the format. I get:',
    'TypeError: Cannot read properties of undefined (reading "year")',
    'please fix it',
  ].join('\n')

  test('extracts a path', async () => {
    expect(spans(original)).toContain('src/foo/bar.ts')
  })

  test('extracts a camelCase identifier', async () => {
    expect(spans(original)).toContain('parseDate')
  })

  test('extracts a backticked span', async () => {
    expect(spans(original)).toContain('`toIsoString`')
  })

  test('extracts an error line', async () => {
    expect(spans(original)).toContain('TypeError: Cannot read properties of undefined (reading "year")')
  })

  test('extracts a URL', async () => {
    expect(spans(original)).toContain('https://example.com/docs/dates?x=1')
  })

  test('extracts fenced blocks, quoted phrases, flags and snake_case', async () => {
    const text = 'run it with --plugin-dir and check "the first three rows" of user_count\n```sh\nnpm test\n```'
    const found = spans(text)
    expect(found).toContain('--plugin-dir')
    expect(found).toContain('the first three rows')
    expect(found).toContain('user_count')
    expect(found).toContain('```sh\nnpm test\n```')
  })

  test('ignores prose abbreviations and sentence punctuation', async () => {
    const found = spans('fix the bug, e.g. the one in parsing. Then stop.')
    expect(found).toEqual([])
  })

  test('preserves passes when every span is present', async () => {
    const polished = [
      'The parser in src/foo/bar.ts calls parseDate twice; see `toIsoString` and',
      'https://example.com/docs/dates?x=1 for the format. I get:',
      'TypeError: Cannot read properties of undefined (reading "year")',
      'Please fix it.',
    ].join('\n')
    expect(preserves(original, polished)).toBe(true)
  })

  test('preserves fails when one character of a path changes', async () => {
    const polished = original.replace('src/foo/bar.ts', 'src/foo/baz.ts')
    expect(preserves(original, polished)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// added
// ---------------------------------------------------------------------------

describe('added', () => {
  test('an inserted clause yields one range at the right offsets', async () => {
    const original = 'fix the date bug in the parser'
    const polished = 'fix the date bug in the parser, the one in src/dates.ts'
    const ranges = added(original, polished)
    expect(ranges).toHaveLength(1)
    const clause = ', the one in src/dates.ts'
    expect(ranges[0]).toEqual({ start: polished.indexOf('the one'), end: polished.length })
    expect(polished.slice(ranges[0]!.start, ranges[0]!.end)).toBe(clause.slice(2))
  })

  test('an identical text yields none', async () => {
    expect(added('fix the date bug', 'fix the date bug')).toEqual([])
    expect(added('fix the date bug', 'Fix the date bug.')).toEqual([])
  })

  test('a reordered text yields only the moved words', async () => {
    const polished = 'fix the parser bug in the date module'
    const ranges = added('fix the bug in the date module parser', polished)
    expect(ranges.map(r => polished.slice(r.start, r.end))).toEqual(['parser'])
  })
})

// ---------------------------------------------------------------------------
// trimContext / buildPrompt
// ---------------------------------------------------------------------------

const row = (role: SessionMessage['role'], text: string, toolResults?: SessionMessage['toolResults']): SessionMessage =>
  ({ role, text, toolUses: [], ...(toolResults ? { toolResults } : {}) }) as SessionMessage

describe('trimContext', () => {
  test('a 20-row transcript trims to the last 6', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i % 2 ? 'assistant' : 'user', `message ${i}`))
    const { recent } = trimContext(rows, undefined)
    expect(recent).toHaveLength(RECENT_ROWS)
    expect(recent[0]).toBe('user: message 14')
    expect(recent[5]).toBe('assistant: message 19')
  })

  test('tool-result rows contribute nothing and long rows are cut', async () => {
    const rows = [
      row('user', 'x'.repeat(1000)),
      row('user', '', [{ toolUseId: 't1', text: 'tool output' }] as never),
      row('assistant', 'done'),
    ]
    const { recent } = trimContext(rows, undefined)
    expect(recent).toHaveLength(2)
    expect(recent[0]).toHaveLength('user: '.length + 400)
    expect(recent.join('\n')).not.toContain('tool output')
  })

  test('a 10 KB instruction file trims to 2,000 chars', async () => {
    const { instructions } = trimContext([], 'i'.repeat(10 * 1024))
    expect(instructions).toHaveLength(INSTRUCTION_CHARS)
  })

  test('the built prompt carries the original verbatim inside its delimiters', async () => {
    const original = 'fix the  date bug\nin `parse()` please, keep   spacing'
    const prompt = buildPrompt(original, trimContext([row('user', 'hello')], '# Project\nrules'))
    expect(prompt).toContain(`<prompt>\n${original}\n</prompt>`)
    expect(prompt).toContain('<recent-conversation>\nuser: hello\n</recent-conversation>')
    expect(prompt).toContain('<project-instructions>\n# Project\nrules\n</project-instructions>')
  })

  test('clean strips a wrapping fence or quotes the original lacked', async () => {
    expect(clean('fix it', '```\nFix it.\n```')).toBe('Fix it.')
    expect(clean('fix it', '"Fix it."')).toBe('Fix it.')
    expect(clean('```js\nx\n```', '```js\nx\n```')).toBe('```js\nx\n```')
  })
})

// ---------------------------------------------------------------------------
// withinLength
// ---------------------------------------------------------------------------

describe('withinLength', () => {
  const original = 'o'.repeat(100)
  test('accepts exactly 1.5x + 80', async () => {
    expect(withinLength(original, 'p'.repeat(230))).toBe(true)
  })
  test('rejects one character over', async () => {
    expect(withinLength(original, 'p'.repeat(231))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Engine hooks
// ---------------------------------------------------------------------------

type Harness = {
  box: string
  fills: PromptFillInput[]
  completes: ModelCompleteRequest[]
  nexts: PromptSubmitInput[]
  commands: CommandSpec[]
  toasts: string[]
  stored: Record<string, unknown>
  rows: SessionMessage[]
  reply: () => ModelCompleteResult | Promise<ModelCompleteResult>
  fillResult: PromptFillResult
  /** Called after each fill, for a test waiting on a press whose work outlives it. */
  filled?: () => void
}

const ORIGINAL = 'fix the date bug in src/dates.ts, `parseDate` is returning wrong year for leap days'
const POLISHED = 'Fix the date bug in src/dates.ts: `parseDate` is returning the wrong year for leap days.'

const answered = (text: string): ModelCompleteResult =>
  ({ isAnswered: true, text, usage: {} }) as unknown as ModelCompleteResult

/** Mocks beneath the plugin. `box` is the prompt box: fills write it, `prompt.read` reads it, a submit empties it. */
const harness = (on: On, init: Partial<Harness> = {}): Harness => {
  const hx: Harness = {
    box: '',
    fills: [],
    completes: [],
    nexts: [],
    commands: [],
    toasts: [],
    stored: {},
    rows: [row('user', 'earlier we looked at the leap-day case'), row('assistant', 'the parser is in src/dates.ts')],
    reply: () => answered(POLISHED),
    fillResult: { isFilled: true },
    ...init,
  }
  on('store.get', async (_$, e) => ({ value: hx.stored[e.key] }))
  on('store.set', async (_$, e) => {
    hx.stored[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', async (_$, e) => {
    hx.commands.push(e)
    return { value: { command: e.name } }
  })
  on('session.start', async (_$, e) => e as never)
  on('session.messages', async () => ({ value: hx.rows }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.exists', async () => ({ value: true }))
  on('fs.read', async () => ({ value: '# Project\nDates are UTC.' }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    hx.toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', async (_$, e) => {
    hx.completes.push(e)
    return { value: await hx.reply() }
  })
  on('prompt.read', async () => ({ value: { text: hx.box, cursor: hx.box.length } }))
  on('prompt.fill', async (_$, e) => {
    hx.fills.push(e)
    if (hx.fillResult.isFilled) hx.box = e.mode === 'append' ? hx.box + e.text : e.text
    hx.filled?.()
    return hx.fillResult
  })
  on('prompt.submit', async (_$, e) => {
    hx.nexts.push(e)
    hx.box = ''
    return { text: e.text }
  })
  on('prompt.edit', async (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    hx.box = text
    return { text, cursor: e.start + e.inputText.length }
  })
  on('ui.render', async () => h('Box', {}) as never)
  return hx
}

const start = ($: Engine) =>
  $.session.start({ source: 'startup', cwd: '/proj', surface: 'terminal', isInteractive: true } as never)

const submit = ($: Engine, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })

/** `prompt.edit` is the editor's own event: the test engine raises it but its typing lists it under no noun. */
const edit = ($: Engine, e: PromptEditInput) =>
  ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit(e)

/** The person types `text` into an empty box, as one folded edit. */
const type = ($: Engine, hx: Harness, text: string) =>
  edit($, { origin: { kind: 'user' } as never, text: hx.box, cursor: hx.box.length, start: hx.box.length, end: hx.box.length, inputText: text })

/** The person replaces the whole box with `text`. */
const retype = ($: Engine, hx: Harness, text: string) =>
  edit($, { origin: { kind: 'user' } as never, text: hx.box, cursor: 0, start: 0, end: hx.box.length, inputText: text })

const polish = ($: Engine, args: string) =>
  $.command.run({ command: 'polish', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 3 } as never
const mount = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal', props = PROPS) =>
  $.ui.mount({ plugin: 'prompt-polish', surface, component: 'AbovePrompt', props })

/** Types a draft, mounts the band and presses the polish choice: what the chord does. */
const pressPolish = async ($: Engine, hx: Harness, draft = ORIGINAL) => {
  await type($, hx, draft)
  const ui = await mount($)
  await ui.press({ key: 'polish' })
  return ui
}

describe('session.start', () => {
  test('seeds enabled from the store and registers /polish', async ($, on) => {
    const hx = harness(on, { stored: { enabled: false } })
    await start($)
    expect(hx.commands.map(c => c.name)).toContain('polish')
    expect(hx.commands[0]?.description).toMatch(/on, off, restore/)
    expect((await polish($, '')).text).toMatch(/is off/)
    await type($, hx, ORIGINAL)
    const ui = await mount($)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await ui.unmount()
  })

  test('defaults enabled to true with an empty store', async ($, on) => {
    harness(on)
    await start($)
    expect((await polish($, '')).text).toMatch(/is on/)
  })
})

describe('polishNow', () => {
  test('the chord fills the polished text with decorations and holds both texts', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await pressPolish($, hx)
    expect(hx.completes).toHaveLength(1)
    expect(hx.completes[0]?.prompt).toContain(ORIGINAL)
    expect(hx.completes[0]?.prompt).toContain('leap-day case')
    expect(hx.fills).toHaveLength(1)
    expect(hx.fills[0]).toMatchObject({ text: POLISHED, mode: 'replace' })
    expect(hx.fills[0]?.decorations?.length).toBeGreaterThan(0)
    expect(hx.box).toBe(POLISHED)
    expect(hx.toasts).toHaveLength(0)
    await ui.redraw()
    expect(await ui.find({ type: 'Button', text: LABEL_RESTORE })).toBeDefined()
    expect(hx.nexts).toHaveLength(0)
    await ui.unmount()
  })

  test('an empty or blank box draws no band and issues no model call', async ($, on) => {
    const hx = harness(on)
    await start($)
    await type($, hx, '   ')
    const ui = await mount($)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await polish($, '')).text).toMatch(/is on/)
    expect(hx.completes).toHaveLength(0)
    expect(hx.fills).toHaveLength(0)
    await ui.unmount()
  })

  test('a second press during a pending completion issues no second call', async ($, on) => {
    let release: (r: ModelCompleteResult) => void = () => {}
    let called: () => void = () => {}
    const pending = new Promise<ModelCompleteResult>(resolve => {
      release = resolve
    })
    const calling = new Promise<void>(resolve => {
      called = resolve
    })
    const hx = harness(on, {
      reply: () => {
        called()
        return pending
      },
    })
    await start($)
    await type($, hx, ORIGINAL)
    const ui = await mount($)
    const first = ui.press({ key: 'polish' })
    await calling
    expect(hx.completes).toHaveLength(1)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: new RegExp(LEAD_BUSY) })).toBeDefined()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await polish($, '')).text).toBe(LEAD_BUSY)
    const filled = new Promise<void>(resolve => {
      hx.filled = resolve
    })
    release(answered(POLISHED))
    await first
    await filled
    expect(hx.completes).toHaveLength(1)
    expect(hx.fills).toHaveLength(1)
    expect(hx.box).toBe(POLISHED)
    await ui.unmount()
  })
})

describe('failures leave the draft intact', () => {
  const cases: { name: string; init: Partial<Harness>; toast: RegExp; fills: number }[] = [
    { name: 'an aborted completion', init: { reply: () => ({ isAnswered: false, reason: 'aborted' }) as ModelCompleteResult }, toast: /failed \(aborted\)/, fills: 0 },
    { name: 'an empty reply', init: { reply: () => answered('   ') }, toast: /empty reply/, fills: 0 },
    { name: 'a reply that drops a path', init: { reply: () => answered(POLISHED.replace('src/dates.ts', 'src/date.ts')) }, toast: /path or identifier/, fills: 0 },
    { name: 'a reply over the length cap', init: { reply: () => answered(`${POLISHED} ${'Also note that this matters. '.repeat(10)}`) }, toast: /too long/, fills: 0 },
    { name: 'a refused fill', init: { fillResult: { isFilled: false, refusal: 'no_composer' } }, toast: /Could not write the prompt box/, fills: 1 },
  ]
  for (const c of cases) {
    test(`${c.name} keeps the box as typed and toasts`, async ($, on) => {
      const hx = harness(on, c.init)
      await start($)
      const ui = await pressPolish($, hx)
      expect(hx.completes).toHaveLength(1)
      expect(hx.fills).toHaveLength(c.fills)
      expect(hx.box).toBe(ORIGINAL)
      expect(hx.toasts).toHaveLength(1)
      expect(hx.toasts[0]).toMatch(c.toast)
      await ui.redraw()
      expect(await ui.find({ type: 'Button', text: LABEL_POLISH })).toBeDefined()
      expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
      expect(hx.nexts).toHaveLength(0)
      await ui.unmount()
    })
  }
})

describe('toggle', () => {
  test('the chord swaps back to the original, forward to the polished text, with one model call', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await pressPolish($, hx)
    await ui.redraw()
    await ui.press({ key: 'polish' })
    expect(hx.box).toBe(ORIGINAL)
    expect(hx.fills[1]).toMatchObject({ text: ORIGINAL, mode: 'replace' })
    expect(hx.fills[1]?.decorations).toBeUndefined()
    await ui.redraw()
    expect(await ui.find({ type: 'Button', text: LABEL_POLISHED })).toBeDefined()
    await ui.press({ key: 'polish' })
    expect(hx.box).toBe(POLISHED)
    expect(hx.fills[2]?.decorations?.length).toBeGreaterThan(0)
    expect(hx.completes).toHaveLength(1)
    await ui.redraw()
    expect(await ui.find({ type: 'Button', text: LABEL_RESTORE })).toBeDefined()
    await ui.unmount()
  })

  test('the chord on an edited draft polishes afresh', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await pressPolish($, hx)
    const edited = `${POLISHED} Keep the tests green.`
    hx.reply = () => answered(`${edited}`)
    await retype($, hx, edited)
    await ui.redraw()
    expect(await ui.find({ type: 'Button', text: LABEL_RESTORE })).toBeDefined()
    await ui.press({ key: 'polish' })
    expect(hx.completes).toHaveLength(2)
    expect(hx.completes[1]?.prompt).toContain(edited)
    expect((await polish($, 'restore')).text).toMatch(/restored/)
    expect(hx.box).toBe(edited)
    await ui.unmount()
  })
})

describe('command.run polish', () => {
  test('off persists, empties the band and makes the chord do nothing', async ($, on) => {
    const hx = harness(on)
    await start($)
    expect((await polish($, 'off')).text).toMatch(/off/)
    expect(hx.stored['enabled']).toBe(false)
    await type($, hx, ORIGINAL)
    const ui = await mount($)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await polish($, '')).text).toMatch(/is off/)
    expect(hx.completes).toHaveLength(0)
    expect((await polish($, 'on')).text).toMatch(/on/)
    expect(hx.stored['enabled']).toBe(true)
    await ui.unmount()
  })

  test('restore after a polish puts the original back', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await pressPolish($, hx)
    expect((await polish($, 'restore')).text).toMatch(/restored/)
    expect(hx.box).toBe(ORIGINAL)
    const result = await submit($, ORIGINAL)
    expect(result).toMatchObject({ text: ORIGINAL })
    expect(hx.nexts).toHaveLength(1)
    expect(hx.completes).toHaveLength(1)
    await ui.unmount()
  })

  test('restore with nothing held says so', async ($, on) => {
    harness(on)
    await start($)
    expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
  })

  test('/polish <text> polishes that text into the box', async ($, on) => {
    const hx = harness(on)
    await start($)
    const result = await polish($, ORIGINAL)
    expect(result.text).toMatch(/Polished/)
    expect(hx.completes).toHaveLength(1)
    expect(hx.completes[0]?.prompt).toContain(ORIGINAL)
    expect(hx.box).toBe(POLISHED)
  })

  test('bare /polish polishes a box that holds text and otherwise names the state and chord', async ($, on) => {
    const hx = harness(on)
    await start($)
    const status = (await polish($, '')).text
    expect(status).toMatch(/is on/)
    expect(status).toMatch(/ctrl\+↓/)
    expect(status).toMatch(/command:polish/)
    expect(status).toMatch(/on, off, restore/)
    expect(hx.completes).toHaveLength(0)
    hx.box = ORIGINAL
    expect((await polish($, '')).text).toMatch(/Polished/)
    expect(hx.completes).toHaveLength(1)
    expect(hx.box).toBe(POLISHED)
  })
})

describe('prompt.submit', () => {
  test('every submit reaches next unchanged with no model call', async ($, on) => {
    const hx = harness(on)
    await start($)
    await type($, hx, ORIGINAL)
    const result = await submit($, ORIGINAL)
    expect(result).toMatchObject({ text: ORIGINAL })
    await $.prompt.submit({ text: ORIGINAL, origin: { kind: 'task-notification' }, wait: false })
    await $.prompt.submit({ text: ORIGINAL, origin: { kind: 'composer' }, turnId: 't1', wait: false })
    expect(hx.nexts).toHaveLength(3)
    expect(hx.nexts.map(n => n.text)).toEqual([ORIGINAL, ORIGINAL, ORIGINAL])
    expect(hx.completes).toHaveLength(0)
  })

  test('a send clears the hold and the hint', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await pressPolish($, hx)
    await submit($, POLISHED)
    expect(hx.nexts).toHaveLength(1)
    expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
    await ui.redraw()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await ui.unmount()
  })
})

describe('prompt.edit', () => {
  test('a 7-word draft shows the hint and a 5-word one does not', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await mount($)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await type($, hx, 'fix the login redirect bug')
    await ui.redraw()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await type($, hx, ' in prod')
    await ui.redraw()
    expect(await ui.find({ type: 'Button', text: LABEL_POLISH })).toBeDefined()
    await retype($, hx, 'fix the login redirect bug')
    await ui.redraw()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await ui.unmount()
  })

  test('editing a polished draft keeps the hold; emptying the box clears it', async ($, on) => {
    const hx = harness(on)
    await start($)
    const ui = await pressPolish($, hx)
    await type($, hx, ' please')
    await ui.redraw()
    expect(await ui.find({ type: 'Button', text: LABEL_RESTORE })).toBeDefined()
    expect((await polish($, 'restore')).text).toMatch(/restored/)
    await retype($, hx, '')
    await ui.redraw()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
    await ui.unmount()
  })
})

describe('AbovePrompt band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: draws nothing without a draft`, async ($, on) => {
      harness(on)
      await start($)
      const ui = await mount($, surface)
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
      await ui.unmount()
    })

    test(`${surface}: the hint names the chord and carries the action`, async ($, on) => {
      const hx = harness(on)
      await start($)
      await type($, hx, ORIGINAL)
      const ui = await mount($, surface)
      const polishButton = await ui.find({ type: 'Button', text: LABEL_POLISH })
      expect(polishButton?.props['hotkey']).toBe('1')
      expect(polishButton?.props['action']).toBe(CHORD_ACTION)
      expect((await ui.find({ type: 'Button', text: LABEL_OFF }))?.props['hotkey']).toBe('2')
      expect(await ui.find({ type: 'Button', text: LABEL_DISMISS })).toBeUndefined()
      expect((await ui.find({ type: 'Text', text: /^polish · $/ }))?.props['dimColor']).toBe(true)
      expect(await ui.find({ type: 'Text', text: /ctrl\+↓/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /ctrl\+x tab/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: '✦' }))?.props['color']).toBe('suggestion')
      await ui.unmount()
    })

    test(`${surface}: the review band offers restore, off and dismiss`, async ($, on) => {
      const hx = harness(on)
      await start($)
      const ui = await pressPolish($, hx)
      await ui.redraw()
      const restoreButton = await ui.find({ type: 'Button', text: LABEL_RESTORE })
      expect(restoreButton?.props['hotkey']).toBe('1')
      expect(restoreButton?.props['action']).toBe(CHORD_ACTION)
      expect((await ui.find({ type: 'Button', text: LABEL_OFF }))?.props['hotkey']).toBe('2')
      const dismissButton = await ui.find({ type: 'Button', text: LABEL_DISMISS })
      expect(dismissButton?.props['hotkey']).toBe('0')
      expect(dismissButton?.props['role']).toBe('dismiss')
      expect((await ui.find({ type: 'Text', text: /^polished · $/ }))?.props['dimColor']).toBe(true)
      expect(await ui.find({ type: 'Text', text: /press Enter to send/ })).toBeDefined()

      await ui.press({ key: 'off' })
      expect(hx.stored['enabled']).toBe(false)
      expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
      await ui.redraw()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await ui.unmount()
    })

    test(`${surface}: dismiss hides the band and keeps the draft`, async ($, on) => {
      const hx = harness(on)
      await start($)
      const ui = await pressPolish($, hx)
      await ui.redraw()
      await ui.press({ key: 'dismiss' })
      expect(hx.box).toBe(POLISHED)
      await ui.redraw()
      expect(await ui.find({ type: 'Button', text: LABEL_DISMISS })).toBeUndefined()
      const result = await submit($, POLISHED)
      expect(result).toMatchObject({ text: POLISHED })
      expect(hx.completes).toHaveLength(1)
      await ui.unmount()
    })

    test(`${surface}: yields to a survey`, async ($, on) => {
      const hx = harness(on)
      await start($)
      await type($, hx, ORIGINAL)
      const ui = await mount($, surface, { hasSurvey: true, isWorking: false, maxRows: 3 } as never)
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await ui.unmount()
    })
  }
})

// ---------------------------------------------------------------------------
// Fixtures: rough prompts shaped like real ones from recent sessions, with the
// haiku output accepted while tuning SYSTEM (task 4.5). The model is mocked to
// return the accepted output; the assertions hold the pairs to the spec.
// ---------------------------------------------------------------------------

type Fixture = { name: string; rows: SessionMessage[]; input: string; output: string; asks: boolean }

const FIXTURES: Fixture[] = [
  {
    name: 'ambiguous target',
    rows: [row('user', 'the parser in src/dates/parse.ts mangles leap days'), row('assistant', 'I see it, parseDate assumes 365 days.'), row('user', 'also the formatter prints 2-digit years in src/dates/format.ts'), row('assistant', "formatDate uses 'YY' there.")],
    input: 'fix the date bug, keep the rest same and dont touch tests',
    output: "Fix the date bug, keep the rest the same, and don't touch tests.\n\nNot sure if you mean the leap day bug or the 2-digit year issue.",
    asks: true,
  },
  {
    name: 'clear task',
    rows: [],
    input: 'add a --dry-run flag to the sync script so it prints what it would copy without copying, update the README usage section too',
    output: 'Add a --dry-run flag to the sync script so it prints what it would copy without copying, and update the README usage section too.',
    asks: false,
  },
  {
    name: 'Hinglish',
    rows: [],
    input: 'yaar `useReportStore` me jo selector hai wo har render pe naya object bana raha hai, src/store/report.ts dekho aur memoize kar do, baki kuch mat chhedna',
    output: "The selector in `useReportStore` creates a new object on every render. Look at src/store/report.ts and memoize it. Don't touch anything else.",
    asks: false,
  },
  {
    name: 'pasted error',
    rows: [row('user', 'run the build'), row('assistant', 'Ran `npm run build`, it failed.')],
    input: "build fail ho raha hai is error ke saath, fix karo\nError: Cannot find module './dates/format'\n    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)",
    output: "The build is failing with this error, fix it.\n\nError: Cannot find module './dates/format'\n    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)",
    asks: false,
  },
  {
    name: 'pronoun resolved by the transcript',
    rows: [row('user', 'look at hooks/register.tsx, the band draws even when a survey is up'), row('assistant', 'The ui.render hook in hooks/register.tsx ignores e.props.hasSurvey. I can gate on it.'), row('user', 'show me the diff first'), row('assistant', 'Here is the diff: it returns next(e) when hasSurvey is true.')],
    input: 'ok apply it but also make sure it doesnt redraw on every keystroke, that was slow before',
    output: "ok apply the diff but also make sure the band doesn't redraw on every keystroke, that was slow before",
    asks: false,
  },
]

describe('fixtures', () => {
  for (const f of FIXTURES) {
    test(f.name, async ($, on) => {
      const hx = harness(on, { rows: f.rows, reply: () => answered(f.output) })
      await start($)
      const ui = await pressPolish($, hx, f.input)
      const [call] = hx.completes
      expect(call?.prompt).toContain(f.input)
      for (const row of f.rows) expect(call?.prompt).toContain(row.text)
      expect(hx.completes).toHaveLength(1)
      expect(hx.fills).toHaveLength(1)
      expect(hx.fills[0]?.text).toBe(f.output)
      expect(hx.box).toBe(f.output)
      expect(preserves(f.input, f.output)).toBe(true)
      expect(withinLength(f.input, f.output)).toBe(true)
      // One open point at most: exactly one extra line, at the end, and only in the ambiguous case.
      const lines = (t: string) => t.split('\n').filter(l => l.trim().length > 0)
      expect(lines(f.output)).toHaveLength(lines(f.input).length + (f.asks ? 1 : 0))
      if (f.asks) expect(lines(f.output).at(-1)).toMatch(/\?|not sure/i)
      expect(hx.nexts).toHaveLength(0)
      expect(hx.toasts).toHaveLength(0)
      await ui.unmount()
    })
  }
})
