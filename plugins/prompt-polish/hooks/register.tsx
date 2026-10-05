import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { Held, HeldView } from '../types'

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

const enabled = atom({ plugin: 'prompt-polish', key: 'enabled' } as const, true)
const ready = atom({ plugin: 'prompt-polish', key: 'ready' } as const, false)
const busy = atom({ plugin: 'prompt-polish', key: 'busy' } as const, false)
const held = atom({ plugin: 'prompt-polish', key: 'held' } as const, null as Held | null)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_WORDS = 6
export const RECENT_ROWS = 6
export const ROW_CHARS = 400
export const INSTRUCTION_CHARS = 2000
export const MODEL = 'haiku'
export const MAX_TOKENS = 1024
export const TIMEOUT_MS = 8000
export const ADDED_COLOR = 'cyan'

export const SYSTEM = `You polish prompts that a developer typed into a coding assistant's prompt box, just before they are sent. You rewrite the prompt into clear English that says exactly what the developer said, nothing more.

Rules:
- Keep the developer's order, voice and intent. Fix grammar, spelling and clarity. Translate Hindi or Hinglish into plain English. Keep the same sentences in the same order; do not restructure into sections, bullet points or a template. The result is still a message from the developer, in the first person where the original was.
- When the prompt says "it", "that", "this" or "the file" and the recent conversation establishes exactly one thing it means, write that thing's name in the pronoun's place (a file, function, diff, change or feature named in the conversation). Do this for every such pronoun, including the object of the verb ("apply it" becomes "apply the diff" when the conversation just showed a diff). When the conversation leaves the referent open, keep the pronoun. Add nothing else the developer did not say or clearly mean. Never add requirements about tests, performance, style, compatibility, error handling, documentation or anything else.
- Copy every code span, file path, identifier, command, flag, URL, version number and error message character for character, including backticks and quotes. Never translate, reformat, expand or correct them.
- If something important to the request cannot be resolved from the prompt and the context, end with one short line of its own, on a new line after the polished text, in the developer's voice, naming that one open point (for example: "not sure if you mean the parser or the formatter"). Otherwise add no question. Never ask more than one.
- Stay close to the original length. The result must not be much longer than the original.
- Output only the polished prompt: no preamble, no explanation, no quotes or code fence around it, no notes after it.`

// ---------------------------------------------------------------------------
// Polishable: what the hint shows for
// ---------------------------------------------------------------------------

const ACKS = new Set([
  // English
  'yes', 'yeah', 'yep', 'yup', 'y', 'ok', 'okay', 'k', 'sure', 'fine', 'go', 'go ahead', 'do it', 'do that',
  'proceed', 'continue', 'carry on', 'go on', 'please', 'please do', 'yes please', 'no', 'nope', 'nah',
  'not now', 'stop', 'wait', 'thanks', 'thank you', 'ty', 'cool', 'great', 'good', 'nice', 'perfect',
  'done', 'correct', 'right', 'agreed', 'sounds good', 'looks good', 'lgtm', 'makes sense', 'got it',
  'hmm', 'hm', 'and', 'then', 'also', 'now', 'just', 'all', 'both', 'first', 'second', 'option', 'one',
  'two', 'three', '1', '2', '3', 'a', 'b', 'c', 'the', 'this', 'that', 'it', 'again', 'retry', 'skip',
  // Hinglish
  'haan', 'ha', 'han', 'haa', 'haanji', 'hanji', 'ji', 'theek', 'thik', 'theek hai', 'thik hai', 'theek h',
  'kar do', 'kardo', 'karo', 'kar', 'do', 'chalo', 'chal', 'chalega', 'nahi', 'nahin', 'nai', 'na', 'sahi',
  'sahi hai', 'badhiya', 'accha', 'acha', 'achha', 'bas', 'ruko', 'ruk', 'aage badho', 'shuru karo',
  'karte hain', 'kar lo', 'karlo', 'dekho', 'dekh lo', 'dekhlo', 'haan bhai', 'bhai', 'yaar', 'bilkul',
  'shukriya', 'dhanyavaad', 'dhanyawad', 'aur', 'phir', 'fir', 'abhi', 'wahi', 'yahi', 'sab', 'dono',
])
const ACK_PHRASE_MAX = 3

export const words = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean)

const normalize = (text: string): string[] =>
  words(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' '))

/** True when the whole text is made of acknowledgement words and phrases. */
export const isAck = (text: string): boolean => {
  const ws = normalize(text)
  if (ws.length === 0) return false
  let i = 0
  while (i < ws.length) {
    let taken = 0
    for (let n = Math.min(ACK_PHRASE_MAX, ws.length - i); n >= 1; n--) {
      if (ACKS.has(ws.slice(i, i + n).join(' '))) {
        taken = n
        break
      }
    }
    if (taken === 0) return false
    i += taken
  }
  return true
}

/** True for a draft worth offering to polish: a task of six words or more, not a command line, not a bare acknowledgement. */
export const polishable = (text: string): boolean => {
  const trimmed = text.trim()
  if (!trimmed.includes('\n') && /^[/!]/.test(trimmed)) return false
  if (words(trimmed).length < MIN_WORDS) return false
  return !isAck(trimmed)
}

// ---------------------------------------------------------------------------
// Technical spans that must survive verbatim
// ---------------------------------------------------------------------------

const FENCE = /(```|~~~)[^\n]*\n[\s\S]*?\n\1/g
const BACKTICK = /`[^`\n]+`/g
const URL = /\bhttps?:\/\/[^\s<>)\]"']+/g
const DOUBLE_QUOTED = /["“]([^"“”\n]+)["”]/g
const SINGLE_QUOTED = /(?:^|[\s(])'([^'\n]+)'(?=$|[\s).,;:!?])/g
const ERROR_LINE = [
  /^\s*(?:\w*Error|\w*Exception|Traceback|panic|fatal|error|warning|warn|FAIL|FAILED)\b\s*[:[(]/i,
  /\b\w*(?:Error|Exception):\s/,
  /^\s*at\s+\S+\s*\(/,
  /^\s*File "[^"]+", line \d+/,
  /\bexit(?:ed with)? code\s*\d+/i,
  /\b(?:ENOENT|EACCES|ECONNREFUSED|EPERM|EADDRINUSE|ETIMEDOUT|SIGSEGV|SIGKILL)\b/,
  /\b(?:command not found|segmentation fault|cannot find module|is not defined|is not a function|undefined is not)\b/i,
]
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'a.m', 'p.m'])

const stripEdges = (token: string): string => token.replace(/^[(["'“‘<{,;:]+|[)\]"'”’>},;:!?]+$/g, '')

const isPathLike = (token: string): boolean => {
  if (token.includes('/')) {
    return /^(?:[~.]{0,2}\/)?[\w.@+-]*(?:\/[\w.@+-]*)+$/.test(token) && /\w/.test(token) && token !== '/'
  }
  const file = /^[\w+-]{2,}(?:\.[\w+-]{1,8})+$/.exec(token)
  if (!file) return false
  const lower = token.toLowerCase().replace(/\.$/, '')
  return !ABBREVIATIONS.has(lower)
}

const isIdentifierLike = (token: string): boolean =>
  /^[\w$.-]*(?:_\w|::|->|\(\))[\w$().:>-]*$/.test(token) ||
  /^--?[a-zA-Z][\w-]*(?:=\S*)?$/.test(token) ||
  /^\$[\w.]+$/.test(token) ||
  (/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(token) && !/^[a-z]+$/.test(token)) ||
  /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(token) ||
  /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(token)

const isErrorLine = (line: string): boolean => ERROR_LINE.some(re => re.test(line))

/** Every span of the text that a polished version must carry character for character. */
export const spans = (text: string): string[] => {
  const found: string[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (t.length > 0 && !found.includes(t)) found.push(t)
  }
  let rest = text
  for (const m of text.match(FENCE) ?? []) {
    add(m)
    rest = rest.replace(m, ' ')
  }
  for (const m of rest.match(BACKTICK) ?? []) {
    add(m)
    rest = rest.replace(m, ' ')
  }
  for (const m of rest.match(URL) ?? []) {
    add(m)
    rest = rest.replace(m, ' ')
  }
  for (const line of rest.split('\n')) {
    if (isErrorLine(line)) add(line)
  }
  for (const re of [DOUBLE_QUOTED, SINGLE_QUOTED]) {
    for (const m of rest.matchAll(re)) {
      const inner = m[1] ?? ''
      if (words(inner).length > 2) add(inner)
    }
  }
  for (const raw of rest.split(/\s+/)) {
    const token = stripEdges(raw)
    if (token.length < 2) continue
    if (isPathLike(token) || isIdentifierLike(token)) add(token)
  }
  return found
}

/** True when every technical span of the original appears verbatim in the polished text. */
export const preserves = (original: string, polished: string): boolean =>
  spans(original).every(s => polished.includes(s))

/** True when the polished text is not much longer than the original. */
export const withinLength = (original: string, polished: string): boolean =>
  polished.length <= 1.5 * original.length + 80

// ---------------------------------------------------------------------------
// Word-level diff for the added-text decorations
// ---------------------------------------------------------------------------

export type Range = { start: number; end: number }

type Word = { key: string; start: number; end: number }

const WORD_LIMIT = 1500

const tokenize = (text: string): Word[] => {
  const out: Word[] = []
  for (const m of text.matchAll(/\S+/g)) {
    const raw = m[0]
    const key = raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || raw
    out.push({ key, start: m.index, end: m.index + raw.length })
  }
  return out
}

/** Character ranges of the polished text's words that the original does not have, adjacent words merged. */
export const added = (original: string, polished: string): Range[] => {
  const a = tokenize(original)
  const b = tokenize(polished)
  if (a.length > WORD_LIMIT || b.length > WORD_LIMIT) return []
  const n = a.length
  const m = b.length
  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i]!.key === b[j]!.key ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const kept = new Set<number>()
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i]!.key === b[j]!.key) {
      kept.add(j)
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      i++
    } else {
      j++
    }
  }
  const ranges: Range[] = []
  for (let k = 0; k < m; k++) {
    if (kept.has(k)) continue
    const w = b[k]!
    const last = ranges[ranges.length - 1]
    if (last && k > 0 && !kept.has(k - 1)) {
      last.end = w.end
    } else {
      ranges.push({ start: w.start, end: w.end })
    }
  }
  return ranges
}

// ---------------------------------------------------------------------------
// Context and prompt assembly
// ---------------------------------------------------------------------------

export type Context = { recent: string[]; instructions: string }

export const trimContext = (rows: readonly SessionMessage[], instructions: string | undefined): Context => {
  const recent = rows
    .slice(-RECENT_ROWS)
    .filter(r => r.text.trim().length > 0)
    .map(r => `${r.role}: ${r.text.trim().slice(0, ROW_CHARS)}`)
  return { recent, instructions: (instructions ?? '').slice(0, INSTRUCTION_CHARS) }
}

export const buildPrompt = (original: string, context: Context): string => {
  const parts: string[] = []
  if (context.instructions.trim().length > 0) {
    parts.push(`<project-instructions>\n${context.instructions}\n</project-instructions>`)
  }
  if (context.recent.length > 0) {
    parts.push(`<recent-conversation>\n${context.recent.join('\n')}\n</recent-conversation>`)
  }
  parts.push(`<prompt>\n${original}\n</prompt>`)
  parts.push('Polish the text inside <prompt> and output only the polished prompt.')
  return parts.join('\n\n')
}

/** The model's reply with any wrapping fence or quotes the original did not have removed. */
export const clean = (original: string, reply: string): string => {
  let text = reply.trim()
  const fenced = /^(```|~~~)[^\n]*\n([\s\S]*?)\n\1$/.exec(text)
  if (fenced && !original.trim().startsWith(fenced[1]!)) text = fenced[2]!.trim()
  if (text.length > 2 && text.startsWith('"') && text.endsWith('"') && !original.trim().startsWith('"')) {
    text = text.slice(1, -1).trim()
  }
  return text
}

// ---------------------------------------------------------------------------
// Engine hooks
// ---------------------------------------------------------------------------

/** The engine action whose chord (ctrl+↓ or alt+↓ by default) presses the band's polish Button from the prompt. */
export const CHORD_ACTION = 'app:diffFileListDown'
export const CHORD = 'ctrl+↓'
export const COMMAND_DESCRIPTION = 'Polish the draft in the prompt box: no argument or <text> polishes, on, off, restore (original back in the box)'
export const TAG_READY = 'polish'
export const TAG_HELD = 'polished'
export const LEAD_BUSY = 'polishing…'
export const LEAD_HELD = `review and press Enter to send · ${CHORD} swaps the original back`
export const LABEL_POLISH = `Polish draft (${CHORD})`
export const LABEL_RESTORE = 'Restore original'
export const LABEL_POLISHED = 'Use polished'
export const LABEL_OFF = 'Polishing off'
export const LABEL_DISMISS = 'Dismiss'
export const NOTHING_TO_POLISH = 'Nothing to polish: the prompt box is empty.'

const setEnabled = async ($: EngineInterface, value: boolean) => {
  await update($, enabled, () => value)
  await $.store.set('enabled', value)
  if (!value) await update($, held, () => null)
}

const gather = async ($: EngineInterface): Promise<Context> => {
  const rows = await $.session.messages()
  const root = await $.session.root()
  const path = `${root}/CLAUDE.md`
  let instructions: string | undefined
  if (await $.fs.exists(path)) {
    const file = await $.fs.read(path)
    instructions = typeof file === 'string' ? file : undefined
  }
  return trimContext(rows, instructions)
}

const decorate = (original: string, polished: string) =>
  added(original, polished).map(r => ({ ...r, color: ADDED_COLOR }))

/** Puts one of the held texts in the box and records which. */
const show = async ($: EngineInterface, h: Held, view: Exclude<HeldView, 'edited'>): Promise<string> => {
  const text = view === 'polished' ? h.polished : h.original
  const r = await $.prompt.fill({
    text,
    mode: 'replace',
    ...(view === 'polished' ? { decorations: decorate(h.original, h.polished) } : {}),
  })
  if (!r.isFilled) return `Could not write the prompt box (${r.refusal ?? 'refused'}).`
  await update($, held, () => ({ ...h, view }))
  return view === 'polished' ? 'Polished text back in the box; Enter sends it.' : 'Original prompt restored; Enter sends it as typed.'
}

/**
 * Polishes `text` (the box's draft when absent) into the box. Every failure
 * leaves the box as it was and says why in a toast; nothing reaches the
 * transcript. Resolves to the line the caller may show.
 */
const polishNow = async ($: EngineInterface, given?: string): Promise<string> => {
  if (await read($, busy)) return LEAD_BUSY
  const original = (given ?? (await $.prompt.read()).text).trim()
  if (original.length === 0) {
    $.ui.toast(NOTHING_TO_POLISH)
    return NOTHING_TO_POLISH
  }
  const fail = (reason: string): string => {
    $.ui.toast(reason)
    return reason
  }
  await update($, busy, () => true)
  $.ui.status(LEAD_BUSY)
  try {
    const context = await gather($)
    const reply = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: buildPrompt(original, context),
      maxTokens: MAX_TOKENS,
      effort: 'low',
      timeoutMs: TIMEOUT_MS,
    })
    if (!reply.isAnswered) return fail(`Polish failed (${reply.reason}); the draft is unchanged.`)
    const polished = clean(original, reply.text)
    if (polished.length === 0) return fail('Polish discarded: empty reply; the draft is unchanged.')
    if (!preserves(original, polished)) {
      return fail('Polish discarded: a code span, path or identifier was altered; the draft is unchanged.')
    }
    if (!withinLength(original, polished)) return fail('Polish discarded: the reply grew too long; the draft is unchanged.')
    const fill = await $.prompt.fill({ text: polished, mode: 'replace', decorations: decorate(original, polished) })
    if (!fill.isFilled) return fail(`Could not write the prompt box (${fill.refusal ?? 'refused'}); the draft is unchanged.`)
    await update($, held, () => ({ original, polished, view: 'polished' }))
    return 'Polished; review and press Enter to send.'
  } finally {
    await update($, busy, () => false)
    $.ui.status(undefined)
  }
}

/** The chord's work: swap between the held texts while the box shows one of them unedited, else polish afresh. */
const toggle = async ($: EngineInterface): Promise<string> => {
  const h = await read($, held)
  if (h) {
    const box = (await $.prompt.read()).text
    if (box === h.polished) return show($, h, 'original')
    if (box === h.original) return show($, h, 'polished')
  }
  return polishNow($)
}

/** Hides the band until the box changes: the hold goes, and the hint stays down for the draft as it stands. */
const dismiss = async ($: EngineInterface) => {
  await update($, held, () => null)
  await update($, ready, () => false)
}

const restore = async ($: EngineInterface): Promise<string> => {
  const h = await read($, held)
  if (!h) return 'Nothing to restore: no prompt has been polished in this session.'
  return show($, h, 'original')
}

const status = async ($: EngineInterface): Promise<string> => {
  const isOn = await read($, enabled)
  return [
    `Prompt polishing is ${isOn ? 'on' : 'off'}.`,
    `With a draft in the box, ${CHORD} (or alt+↓, the chord bound to ${CHORD_ACTION}) polishes it; ctrl+x tab then 1 does the same.`,
    'For a key of your own, bind "command:polish" in the Chat context of ~/.claude/keybindings.json.',
    'Arguments: on, off, restore, or the text to polish.',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('enabled')
    await update($, enabled, () => stored !== false)
    await update($, ready, () => false)
    await update($, busy, () => false)
    await update($, held, () => null)
    await $.command.register({ name: 'polish', description: COMMAND_DESCRIPTION, argumentHint: '[on|off|restore|text]' })
    return next(e)
  })

  on('command.run', { command: 'polish' }, async ($, e) => {
    // Typing the command emptied the box; the hint has nothing to point at.
    await update($, ready, () => false)
    const arg = e.args.trim()
    const word = arg.toLowerCase()
    if (word === 'on' || word === 'off') {
      await setEnabled($, word === 'on')
      return { text: `Prompt polishing ${word}${word === 'off' ? ' for this session and as the default; /polish on turns it back' : ''}.` }
    }
    if (word === 'restore') return { text: await restore($) }
    if (!(await read($, enabled))) return { text: await status($) }
    if (arg.length > 0) return { text: await polishNow($, arg) }
    const box = (await $.prompt.read()).text
    if (box.trim().length > 0) return { text: await polishNow($, box) }
    return { text: await status($) }
  })

  on('prompt.submit', async ($, e, next) => {
    // Never held, never dropped: the send empties the box without a prompt.edit, so tidy here.
    if (e.origin.kind === 'composer') {
      if (await read($, ready)) await update($, ready, () => false)
      if (await read($, held)) await update($, held, () => null)
    }
    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const isReady = polishable(box.text)
    if (isReady !== (await read($, ready))) await update($, ready, () => isReady)
    const h = await read($, held)
    if (h) {
      if (box.text.length === 0) {
        await update($, held, () => null)
      } else {
        const view: HeldView = box.text === h.polished ? 'polished' : box.text === h.original ? 'original' : 'edited'
        if (view !== h.view) await update($, held, () => ({ ...h, view }))
      }
    }
    return box
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, enabled)) || e.props.hasSurvey) return next(e)
    const isBusy = await read($, busy)
    const hold = await read($, held)
    const isReady = await read($, ready)
    if (!isBusy && !hold && !isReady) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const below = await next(e)
    const choice = (key: string, hotkey: string, label: string, onPress: () => void, extra: { action?: string; role?: 'dismiss' } = {}) => (
      <Box key={key} marginRight={3}>
        <Button key={key} hotkey={hotkey} label={label} plain onPress={onPress} {...extra} />
      </Box>
    )
    const choices = hold
      ? [
          choice('polish', '1', hold.view === 'original' ? LABEL_POLISHED : LABEL_RESTORE, () => void toggle($), { action: CHORD_ACTION }),
          choice('off', '2', LABEL_OFF, () => void setEnabled($, false)),
          choice('dismiss', '0', LABEL_DISMISS, () => void dismiss($), { role: 'dismiss' }),
        ]
      : [
          choice('polish', '1', LABEL_POLISH, () => void toggle($), { action: CHORD_ACTION }),
          choice('off', '2', LABEL_OFF, () => void setEnabled($, false)),
        ]
    const star = (
      <Box flexShrink={0} width={2}>
        <Text color="suggestion">✦</Text>
      </Box>
    )
    // The hint is one row: the chord has to have a drawn Button to reach, so the row is as small as it can be.
    if (!hold && !isBusy) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="flex-start" marginTop={1}>
            {star}
            <Box flexWrap="wrap">
              <Box marginRight={1}>
                <Text dimColor>{TAG_READY} ·</Text>
              </Box>
              {choices}
            </Box>
          </Box>
          {below}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row" alignItems="flex-start">
            {star}
            <Text wrap="wrap">
              <Text dimColor>{isBusy && !hold ? TAG_READY : TAG_HELD} · </Text>
              {isBusy ? LEAD_BUSY : LEAD_HELD}
            </Text>
          </Box>
          {!isBusy && (
            <Box flexDirection="row" alignItems="flex-start">
              <Box flexShrink={0} width={2} />
              <Box flexWrap="wrap">{choices}</Box>
            </Box>
          )}
        </Box>
        {below}
      </Box>
    )
  })
}
