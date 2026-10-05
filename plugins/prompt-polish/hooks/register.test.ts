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
  INSTRUCTION_CHARS,
  POLISHED_NOTICE,
  RECENT_ROWS,
  added,
  buildPrompt,
  clean,
  gate,
  preserves,
  spans,
  trimContext,
  withinLength,
} from './register'

const composer = { origin: { kind: 'composer' } as const }

// ---------------------------------------------------------------------------
// gate
// ---------------------------------------------------------------------------

describe('gate', () => {
  test('passes "yes, go ahead" as an acknowledgement', async () => {
    expect(gate('yes, go ahead', composer)).toBe('short')
    expect(gate('yes, go ahead, please do it and continue', composer)).toBe('ack')
  })

  test('passes "haan kar do" as a Hinglish acknowledgement', async () => {
    expect(gate('haan kar do', composer)).toBe('short')
    expect(gate('haan bhai theek hai kar do chalo', composer)).toBe('ack')
  })

  test('passes a 5-word task as short', async () => {
    expect(gate('fix the login redirect bug', composer)).toBe('short')
  })

  test('polishes a 7-word task', async () => {
    expect(gate('fix the login redirect bug in prod', composer)).toBeNull()
  })

  test('passes a /command line', async () => {
    expect(gate('/foo bar baz qux quux corge grault', composer)).toBe('command')
    expect(gate('!ls -la the whole directory tree please', composer)).toBe('command')
  })

  test('passes a peer origin', async () => {
    expect(gate('please merge the feature branch into main now', { origin: { kind: 'peer' } })).toBe('origin')
  })

  test('passes a mid-turn prompt', async () => {
    expect(gate('also run the tests after you finish that', { ...composer, turnId: 't1' })).toBe('mid-turn')
  })

  test('passes attachments and off', async () => {
    const attachments = [{ kind: 'image' }] as never
    expect(gate('what is wrong in this screenshot of the page', { ...composer, attachments })).toBe('attachments')
    expect(gate('fix the login redirect bug in prod', composer, false)).toBe('off')
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
  fills: PromptFillInput[]
  completes: ModelCompleteRequest[]
  nexts: PromptSubmitInput[]
  commands: CommandSpec[]
  stored: Record<string, unknown>
  rows: SessionMessage[]
  reply: () => ModelCompleteResult
  fillResult: PromptFillResult
}

const ORIGINAL = 'fix the date bug in src/dates.ts, `parseDate` is returning wrong year for leap days'
const POLISHED = 'Fix the date bug in src/dates.ts: `parseDate` is returning the wrong year for leap days.'

const answered = (text: string): ModelCompleteResult =>
  ({ isAnswered: true, text, usage: {} }) as unknown as ModelCompleteResult

const harness = (on: On, init: Partial<Harness> = {}): Harness => {
  const hx: Harness = {
    fills: [],
    completes: [],
    nexts: [],
    commands: [],
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
  on('command.list', async () => ({
    value: hx.commands.map(c => ({ name: c.name, description: c.description, source: 'plugin', plugin: 'prompt-polish' })) as never,
  }))
  on('session.start', async (_$, e) => e as never)
  on('session.messages', async () => ({ value: hx.rows }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.exists', async () => ({ value: true }))
  on('fs.read', async () => ({ value: '# Project\nDates are UTC.' }))
  on('ui.status', async () => ({ value: undefined }))
  on('model.complete', async (_$, e) => {
    hx.completes.push(e)
    return { value: hx.reply() }
  })
  on('prompt.fill', async (_$, e) => {
    hx.fills.push(e)
    return hx.fillResult
  })
  on('prompt.submit', async (_$, e) => {
    hx.nexts.push(e)
    return { text: e.text }
  })
  on('prompt.edit', async (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
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

const polish = ($: Engine, args: string) =>
  $.command.run({ command: 'polish', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

describe('session.start', () => {
  test('seeds enabled from the store and registers /polish', async ($, on) => {
    const hx = harness(on, { stored: { enabled: false } })
    await start($)
    expect((await polish($, '')).text).toMatch(/is off/)
    expect(hx.commands.map(c => c.name)).toContain('polish')
    expect(hx.commands[0]?.description).toMatch(/on.*off.*restore/)
    const result = await submit($, ORIGINAL)
    expect(result).toEqual({ text: ORIGINAL })
    expect(hx.completes).toHaveLength(0)
  })

  test('defaults enabled to true with an empty store', async ($, on) => {
    harness(on)
    await start($)
    expect((await polish($, '')).text).toMatch(/is on/)
  })
})

describe('command.run polish', () => {
  test('off makes a submit pass through without a model call and persists', async ($, on) => {
    const hx = harness(on)
    await start($)
    const r = await polish($, 'off')
    expect(r.text).toMatch(/off/)
    expect(hx.stored['enabled']).toBe(false)
    const result = await submit($, ORIGINAL)
    expect(result).toEqual({ text: ORIGINAL })
    expect(hx.completes).toHaveLength(0)
    expect(hx.nexts).toHaveLength(1)
    const on2 = await polish($, 'on')
    expect(on2.text).toMatch(/on/)
    expect(hx.stored['enabled']).toBe(true)
  })

  test('restore puts the original back and the next submit reaches next unchanged', async ($, on) => {
    const hx = harness(on)
    await start($)
    const first = await submit($, ORIGINAL)
    expect(first.drop).toBeDefined()
    expect(hx.fills[0]?.text).toBe(POLISHED)
    const r = await polish($, 'restore')
    expect(r.text).toMatch(/restored/)
    expect(hx.fills[1]?.text).toBe(ORIGINAL)
    expect(hx.fills[1]?.mode).toBe('replace')
    const second = await submit($, ORIGINAL)
    expect(second).toEqual({ text: ORIGINAL })
    expect(hx.nexts.map(n => n.text)).toEqual([ORIGINAL])
    expect(hx.completes).toHaveLength(1)
  })

  test('restore with nothing held says so', async ($, on) => {
    harness(on)
    await start($)
    expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
  })

  test('bare /polish names the current state', async ($, on) => {
    harness(on)
    await start($)
    expect((await polish($, '')).text).toMatch(/is on/)
    await polish($, 'off')
    expect((await polish($, '')).text).toMatch(/is off/)
  })
})

describe('prompt.submit', () => {
  test('an answered polish fills with decorations, holds, arms and drops', async ($, on) => {
    const hx = harness(on)
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result.drop).toMatch(/polished/)
    expect(hx.completes).toHaveLength(1)
    expect(hx.completes[0]).toMatchObject({ model: 'haiku', effort: 'low', maxTokens: 1024, timeoutMs: 8000 })
    expect(hx.completes[0]?.prompt).toContain(`<prompt>\n${ORIGINAL}\n</prompt>`)
    expect(hx.completes[0]?.prompt).toContain('Dates are UTC.')
    expect(hx.completes[0]?.prompt).toContain('assistant: the parser is in src/dates.ts')
    expect(hx.fills).toHaveLength(1)
    expect(hx.fills[0]?.text).toBe(POLISHED)
    expect(hx.fills[0]?.decorations?.length).toBeGreaterThan(0)
    expect(hx.nexts).toHaveLength(0)

    const edited = `${POLISHED} Keep the tests green.`
    const second = await submit($, edited)
    expect(second).toEqual({ text: edited })
    expect(hx.nexts.map(n => n.text)).toEqual([edited])
    expect(hx.completes).toHaveLength(1)
    const third = await submit($, ORIGINAL)
    expect(third.drop).toMatch(/polished/)
    expect(hx.completes).toHaveLength(2)
  })

  test('short replies, commands and non-composer origins pass through without a model call', async ($, on) => {
    const hx = harness(on)
    await start($)
    await submit($, 'yes, go ahead')
    await submit($, 'haan kar do')
    await submit($, '/foo bar baz qux quux corge grault')
    await $.prompt.submit({ text: ORIGINAL, origin: { kind: 'task-notification' }, wait: false })
    await $.prompt.submit({ text: ORIGINAL, origin: { kind: 'composer' }, turnId: 't1', wait: false })
    expect(hx.completes).toHaveLength(0)
    expect(hx.fills).toHaveLength(0)
    expect(hx.nexts).toHaveLength(5)
  })

  test('a refused fill after a polish lets the original through', async ($, on) => {
    const hx = harness(on, { fillResult: { isFilled: false, refusal: 'no_composer' } })
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result).toEqual({ text: ORIGINAL })
    expect(hx.nexts.map(n => n.text)).toEqual([ORIGINAL])
  })
})

describe('giveBack', () => {
  test('an aborted completion fills the original and drops', async ($, on) => {
    const hx = harness(on, { reply: () => ({ isAnswered: false, reason: 'aborted' }) as ModelCompleteResult })
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result.drop).toMatch(/aborted/)
    expect(hx.fills).toHaveLength(1)
    expect(hx.fills[0]).toMatchObject({ text: ORIGINAL, mode: 'replace' })
    const again = await submit($, ORIGINAL)
    expect(again).toEqual({ text: ORIGINAL })
    expect(hx.completes).toHaveLength(1)
  })

  test('a refused fill on failure lets the original through to next', async ($, on) => {
    const hx = harness(on, {
      reply: () => ({ isAnswered: false, reason: 'aborted' }) as ModelCompleteResult,
      fillResult: { isFilled: false, refusal: 'no_composer' },
    })
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result).toEqual({ text: ORIGINAL })
    expect(hx.nexts.map(n => n.text)).toEqual([ORIGINAL])
  })

  test('a reply that drops a path is discarded', async ($, on) => {
    const hx = harness(on, { reply: () => answered(POLISHED.replace('src/dates.ts', 'src/date.ts')) })
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result.drop).toMatch(/discarded/)
    expect(hx.fills).toHaveLength(1)
    expect(hx.fills[0]).toMatchObject({ text: ORIGINAL, mode: 'replace' })
    expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
  })

  test('a reply over the length cap is discarded', async ($, on) => {
    const hx = harness(on, { reply: () => answered(`${POLISHED} ${'Also note that this matters. '.repeat(10)}`) })
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result.drop).toMatch(/discarded.*too long/)
    expect(hx.fills).toHaveLength(1)
    expect(hx.fills[0]).toMatchObject({ text: ORIGINAL, mode: 'replace' })
  })

  test('an empty reply is discarded', async ($, on) => {
    const hx = harness(on, { reply: () => answered('   ') })
    await start($)
    const result = await submit($, ORIGINAL)
    expect(result.drop).toMatch(/empty/)
    expect(hx.fills[0]?.text).toBe(ORIGINAL)
  })
})

describe('prompt.edit', () => {
  test('emptying the box disarms so a new prompt is polished again', async ($, on) => {
    const hx = harness(on)
    await start($)
    await submit($, ORIGINAL)
    const box = await edit($, { origin: { kind: 'composer' }, text: POLISHED, cursor: POLISHED.length, start: 0, end: POLISHED.length, inputText: '' })
    expect(box.text).toBe('')
    const fresh = 'now also make the formatter print four-digit years everywhere'
    hx.reply = () => answered('Now also make the formatter print four-digit years everywhere.')
    const result = await submit($, fresh)
    expect(result.drop).toMatch(/polished/)
    expect(hx.completes).toHaveLength(2)
    expect((await polish($, 'restore')).text).toMatch(/restored/)
  })

  test('a non-empty edit keeps the arm', async ($, on) => {
    const hx = harness(on)
    await start($)
    await submit($, ORIGINAL)
    await edit($, { origin: { kind: 'composer' }, text: POLISHED, cursor: 0, start: 0, end: 0, inputText: 'x' })
    const result = await submit($, `x${POLISHED}`)
    expect(result).toEqual({ text: `x${POLISHED}` })
    expect(hx.completes).toHaveLength(1)
  })
})

describe('AbovePrompt band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: draws nothing until a draft is held`, async ($, on) => {
      harness(on)
      await start($)
      const ui = await $.ui.mount({ plugin: 'prompt-polish', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never })
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await ui.unmount()
    })

    test(`${surface}: offers restore and off while a draft is held`, async ($, on) => {
      const hx = harness(on)
      await start($)
      await submit($, ORIGINAL)
      const ui = await $.ui.mount({ plugin: 'prompt-polish', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never })
      const restoreButton = await ui.find({ type: 'Button', text: 'Restore original' })
      const offButton = await ui.find({ type: 'Button', text: 'Polishing off' })
      const dismissButton = await ui.find({ type: 'Button', text: 'Dismiss' })
      expect(restoreButton?.props['hotkey']).toBe('1')
      expect(offButton?.props['hotkey']).toBe('2')
      expect(dismissButton?.props['hotkey']).toBe('0')
      expect(dismissButton?.props['role']).toBe('dismiss')
      expect((await ui.find({ type: 'Text', text: /^polished · $/ }))?.props['dimColor']).toBe(true)
      expect(await ui.find({ type: 'Text', text: /ctrl\+x tab/ })).toBeDefined()

      await ui.press({ key: 'restore' })
      expect(hx.fills[hx.fills.length - 1]).toMatchObject({ text: ORIGINAL, mode: 'replace' })

      await ui.press({ key: 'off' })
      expect(hx.stored['enabled']).toBe(false)
      expect((await polish($, '')).text).toMatch(/is off/)
      expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
      await ui.redraw()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await ui.unmount()
    })

    test(`${surface}: goes away once the draft is sent`, async ($, on) => {
      const hx = harness(on)
      await start($)
      await submit($, ORIGINAL)
      const ui = await $.ui.mount({ plugin: 'prompt-polish', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never })
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(3)
      await submit($, POLISHED)
      expect(hx.nexts).toHaveLength(1)
      await ui.redraw()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      expect((await polish($, 'restore')).text).toMatch(/Nothing to restore/)
      await ui.unmount()
    })

    test(`${surface}: dismiss hides the band and keeps the draft`, async ($, on) => {
      const hx = harness(on)
      await start($)
      await submit($, ORIGINAL)
      const ui = await $.ui.mount({ plugin: 'prompt-polish', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3 } as never })
      await ui.press({ key: 'dismiss' })
      expect(hx.fills).toHaveLength(1)
      await ui.redraw()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await submit($, POLISHED)
      expect(hx.nexts).toHaveLength(1)
      expect(hx.completes).toHaveLength(1)
      await ui.unmount()
    })

    test(`${surface}: yields to a survey`, async ($, on) => {
      harness(on)
      await start($)
      await submit($, ORIGINAL)
      const ui = await $.ui.mount({ plugin: 'prompt-polish', surface, component: 'AbovePrompt', props: { hasSurvey: true, isWorking: false, maxRows: 3 } as never })
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
    name: "ambiguous target",
    rows: [row("user", "the parser in src/dates/parse.ts mangles leap days"), row("assistant", "I see it, parseDate assumes 365 days."), row("user", "also the formatter prints 2-digit years in src/dates/format.ts"), row("assistant", "formatDate uses 'YY' there.")],
    input: "fix the date bug, keep the rest same and dont touch tests",
    output: "Fix the date bug, keep the rest the same, and don't touch tests.\n\nNot sure if you mean the leap day bug or the 2-digit year issue.",
    asks: true,
  },
  {
    name: "clear task",
    rows: [],
    input: "add a --dry-run flag to the sync script so it prints what it would copy without copying, update the README usage section too",
    output: "Add a --dry-run flag to the sync script so it prints what it would copy without copying, and update the README usage section too.",
    asks: false,
  },
  {
    name: "Hinglish",
    rows: [],
    input: "yaar `useReportStore` me jo selector hai wo har render pe naya object bana raha hai, src/store/report.ts dekho aur memoize kar do, baki kuch mat chhedna",
    output: "The selector in `useReportStore` creates a new object on every render. Look at src/store/report.ts and memoize it. Don't touch anything else.",
    asks: false,
  },
  {
    name: "pasted error",
    rows: [row("user", "run the build"), row("assistant", "Ran `npm run build`, it failed.")],
    input: "build fail ho raha hai is error ke saath, fix karo\nError: Cannot find module './dates/format'\n    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)",
    output: "The build is failing with this error, fix it.\n\nError: Cannot find module './dates/format'\n    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)",
    asks: false,
  },
  {
    name: "pronoun resolved by the transcript",
    rows: [row("user", "look at hooks/register.tsx, the band draws even when a survey is up"), row("assistant", "The ui.render hook in hooks/register.tsx ignores e.props.hasSurvey. I can gate on it."), row("user", "show me the diff first"), row("assistant", "Here is the diff: it returns next(e) when hasSurvey is true.")],
    input: "ok apply it but also make sure it doesnt redraw on every keystroke, that was slow before",
    output: "ok apply the diff but also make sure the band doesn't redraw on every keystroke, that was slow before",
    asks: false,
  },
]

describe('fixtures', () => {
  for (const f of FIXTURES) {
    test(f.name, async ($, on) => {
      const hx = harness(on, { rows: f.rows, reply: () => answered(f.output) })
      await start($)
      const r = await submit($, f.input)
      expect(r).toMatchObject({ drop: POLISHED_NOTICE })
      const [call] = hx.completes
      expect(call?.prompt).toContain(f.input)
      for (const row of f.rows) expect(call?.prompt).toContain(row.text)
      expect(hx.completes).toHaveLength(1)
      expect(hx.fills).toHaveLength(1)
      expect(hx.fills[0]?.text).toBe(f.output)
      expect(preserves(f.input, f.output)).toBe(true)
      expect(withinLength(f.input, f.output)).toBe(true)
      // One open point at most: exactly one extra line, at the end, and only in the ambiguous case.
      const lines = (t: string) => t.split('\n').filter(l => l.trim().length > 0)
      expect(lines(f.output)).toHaveLength(lines(f.input).length + (f.asks ? 1 : 0))
      if (f.asks) expect(lines(f.output).at(-1)).toMatch(/\?|not sure/i)
      expect(hx.nexts).toHaveLength(0)
    })
  }
})
