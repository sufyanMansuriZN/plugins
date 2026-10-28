import { read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { WrapUp, WrapUpCall, WrapUpQuestion } from '../types'
import { readTranscript } from './sessions'
import { replyAnchor } from './sessions-model'

const NAME = 'wrap_up'
export const WRAP_UP_TOOL = `mcp__toolkit__${NAME}`
const PENDING = { plugin: 'toolkit', key: 'wrapUpPending' } as const
const AT = { plugin: 'toolkit', key: 'wrapUpAt' } as const
const IS_MOVED = { plugin: 'toolkit', key: 'wrapUpIsMoved' } as const
const LAST = { plugin: 'toolkit', key: 'wrapUpLast' } as const
const CURRENT = { plugin: 'toolkit', key: 'wrapUpCurrent' } as const
const ANSWER = { plugin: 'toolkit', key: 'wrapUpAnswer' } as const

const LABEL_MAX = 24

type AppAction = 'commit' | 'create_pr' | 'merge' | 'fix_ci' | 'address_comments' | 'resolve_conflicts' | 'verify'

// Desktop's app actions have no app behind them in the terminal, so a press sends the label as an answer.
export const APP_ACTIONS: Record<AppAction, string> = {
  commit: 'Commit',
  create_pr: 'Create PR',
  merge: 'Merge',
  fix_ci: 'Fix CI',
  address_comments: 'Address comments',
  resolve_conflicts: 'Resolve conflicts',
  verify: 'Verify',
}

const DESCRIPTION = `Fill the "next step" box the terminal shows at the end of your turn: a two-or-three-sentence recap and, when this turn leaves the user a decision to make or a step to take, one question and buttons that answer it; a turn with nothing pending ends with the recap alone, and the terminal then draws no box. Call it once in EVERY turn in which you kept a task list, changed files, ran commands, or completed multi-step work, as the last tool call of the turn. Skip it for short answers, pure conversation, or a brief read-and-explain turn — a reply that names a follow-up is not brief: ask or propose it, and call this.

The recap never replaces your answer to the user. Call this first, then write your full answer after it, once: the terminal draws the box under your whole reply, wherever the call sits. Ask the box's question only in the box, never also in your text.

Fields — recap and ask are said to the user, in the second person; a reply button's label is the user's whole answer back to you:
- recap: what is now true or changed, then where it stands, including what is not done or not verified (for example: nothing committed, or not checked in the app). Two or three short sentences, about 40 words / 300 characters, in the project's own words. No recommendation here.
- ask (with actions, only when the next move is the user's call — a choice of approach, a go-ahead to fix, commit, push, post or send, an approval): just that ONE decision in one short sentence, never two joined by "and" ("Which fix first?"), with no reason or recommendation and without listing the options the buttons give: your pick, actions[0], is drawn first. At most 100 characters.
Every field is a top-level parameter holding plain prose (actions: a JSON array); none contains markup or another field.`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    recap: {
      type: 'string',
      description:
        'Two or three short sentences to the user (≤300 chars): what is now true or changed, then where it stands, including what is not done or not verified.',
    },
    ask: {
      type: 'string',
      description:
        'The one question (≤100 chars) when the next move is the user\'s call — a choice, a go-ahead (to act here on what this turn found, say), an approval: the decision alone, with no reason or recommendation and without listing the options the buttons give (actions[0] is your pick). Omit it, and actions, when nothing waits on the user.',
    },
    actions: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      description:
        '1 or 2 buttons, recommendation first. They are answers to your ask: the first accepts your recommendation, and another is there only when it is a realistic alternative the user might pick instead, not a menu of everything you mentioned. When blocked is true, they are the most likely answers to your question.',
      items: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: Object.keys(APP_ACTIONS),
            description: 'A common next step, drawn with its own label; a press sends that label as the answer. Omit for a reply.',
          },
          label: {
            type: 'string',
            maxLength: LABEL_MAX,
            description:
              'For a reply: the button text and the whole answer a press sends, 1 to 3 words (4 only when three cannot say it), at most 24 characters: "Yes, fix 1", "Fix 2 instead", "Leave uncommitted". It must answer ask on its own. No leading / or !. Ignored with action.',
          },
        },
        additionalProperties: false,
      },
    },
    blocked: {
      type: 'boolean',
      description: 'true when your work stops here until the user answers (the user gets a notification); omit when the answer can wait.',
    },
  },
  required: ['recap'],
}

const isAppAction = (value: unknown): value is AppAction => typeof value === 'string' && Object.hasOwn(APP_ACTIONS, value)
// A press submits the label as the user's prompt, where a leading / or ! would run a command.
const isCommand = (text: string) => /^\s*[/!]/.test(text)

/** The label a button shows and sends, or the reason it cannot be one. */
function parseAnswer(item: unknown, index: number): { label: string } | string {
  if (typeof item !== 'object' || item === null) return `actions[${index}] must be an object.`
  const { action, label, message } = item as { action?: unknown; label?: unknown; message?: unknown }
  // A press sends only what the button shows, so text the user cannot see is refused, not dropped.
  if (message !== undefined) return `actions[${index}] has a message: a press sends only the label, so put the whole answer in the label.`
  if (action !== undefined) return isAppAction(action) ? { label: APP_ACTIONS[action] } : `actions[${index}].action must be one of ${Object.keys(APP_ACTIONS).join(', ')}.`
  if (typeof label !== 'string' || label.trim() === '') return `actions[${index}] needs a label.`
  if (label.length > LABEL_MAX) return `actions[${index}].label must be at most ${LABEL_MAX} characters.`
  if (isCommand(label)) return `actions[${index}] must not start with / or !.`
  return { label }
}

/** What Claude sent, as a `WrapUp`, or the reason it cannot be drawn. */
export function parseWrapUp(input: unknown): WrapUp | { deny: string } {
  const { recap, ask, actions, blocked } = (input ?? {}) as { recap?: unknown; ask?: unknown; actions?: unknown; blocked?: unknown }
  if (typeof recap !== 'string' || recap.trim() === '') return { deny: 'recap is required: two or three sentences on what is now true and where it stands.' }
  const hasAsk = typeof ask === 'string' && ask.trim() !== ''
  const hasActions = Array.isArray(actions) && actions.length > 0
  if (!hasAsk && !hasActions) return { recap, question: null }
  if (!hasAsk || !hasActions) return { deny: 'Give ask and 1 or 2 actions together, or neither when nothing waits on the user.' }
  if (actions.length > 2) return { deny: 'Give at most 2 actions: your pick first, then one realistic alternative.' }
  const answers: string[] = []
  for (const [index, item] of actions.entries()) {
    const answer = parseAnswer(item, index)
    if (typeof answer === 'string') return { deny: answer }
    answers.push(answer.label)
  }
  return { recap, question: { ask, answers, isBlocked: blocked === true } }
}

/** The tool_use_id of the transcript's last next step call with a question, while no prompt from the user follows it; else null. */
export function openWrapUp(jsonl: string): string | null {
  let open: string | null = null
  for (const line of jsonl.split('\n')) {
    let row: { type?: string; isMeta?: boolean; message?: { content?: unknown } }
    try {
      row = JSON.parse(line)
    } catch {
      // A blank line, a line still being written, or the first one of a file read from its end.
      continue
    }
    const content = row.message?.content
    const blocks = (Array.isArray(content) ? content : []) as { type?: string; id?: string; name?: string; input?: unknown }[]
    // shortcut: a task notification or another session's message also closes the question, as the transcript does not say who sent a prompt.
    if (row.type === 'user' && !row.isMeta && (typeof content === 'string' || blocks.some(block => block.type === 'text'))) open = null
    if (row.type !== 'assistant') continue
    for (const block of blocks) {
      if (block.type !== 'tool_use' || block.name !== WRAP_UP_TOOL || !block.id) continue
      const wrapUp = parseWrapUp(block.input)
      if (!('deny' in wrapUp) && wrapUp.question !== null) open = block.id
    }
  }
  return open
}

/** The whole look of the box: swap this to change the layout. `answered` is the label pressed. */
export function drawWrapUp(elements: Elements['terminal'], recap: string, question: WrapUpQuestion, answered: string | null, onPress: (answer: string) => void) {
  const { Box, Button, Text } = elements
  // Plain dim links like table copy's; hover underlines the nearest keyed Box, so each gets its own.
  const links = question.answers.flatMap((answer, index) => {
    const link = (
      <Box key={`hover:${index}`}>
        <Button key={`answer:${index}`} plain dimColor={index > 0} hover={{ underline: true }} label={answer} onPress={() => onPress(answer)} />
      </Box>
    )
    return index === 0 ? [link] : [<Text dimColor>{'  ·  '}</Text>, link]
  })
  const choice =
    answered !== null ? (
      <Text dimColor>{`You chose: ${answered}`}</Text>
    ) : (
      <Box flexDirection="row" flexWrap="wrap">
        <Text>{`${question.ask}  `}</Text>
        {links}
      </Box>
    )
  // Drawn as the engine draws a tool row: a bullet and the name, then the result under ⎿.
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box width={2} minWidth={2}>
          <Text>●</Text>
        </Box>
        <Text weight="semibold">Next step</Text>
      </Box>
      <Box flexDirection="row">
        <Box width={5} minWidth={5}>
          <Text dimColor>{'  ⎿  '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text>{recap}</Text>
          {choice}
        </Box>
      </Box>
    </Box>
  )
}

/** The box with its buttons, live: a press sends its label as the user, once. */
async function drawCall($: EngineInterface, elements: Elements['terminal'], { toolUseId, recap, question }: WrapUpCall) {
  const answerRef = { ...ANSWER, id: toolUseId }
  const answered = (await read($, answerRef)) ?? null
  const press = async (answer: string) => {
    let isFirst = false
    await update($, answerRef, was => {
      isFirst = was == null
      return was ?? answer
    })
    if (!isFirst) return
    // The prompt runs as a turn of its own once the session is idle, so the press does not wait for it.
    void $.prompt.submit({ text: answer, asUser: true }).catch(err => $.ui.toast(`toolkit: could not send "${answer}": ${String(err)}`))
  }
  return drawWrapUp(elements, recap, question, answered, answer => void press(answer))
}

export const register: Register = on => {
  // Desktop draws its own wrap_up, and a -p run has no one to press a button.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    // A resumed session starts without this state, so its last open question comes back from the transcript, on its call's row.
    void (async () => {
      const open = await readTranscript($, openWrapUp)
      if (open !== null && open !== 'behind' && (await read($, CURRENT)) == null) await $.state.set(CURRENT, open)
    })().catch(err => $.ui.log(`toolkit: could not bring back the open next step box: ${String(err)}`, { to: 'debug' }))
    return next(e)
  })
  on('tool.call', { tool: WRAP_UP_TOOL }, async ($, e) => {
    const wrapUp = parseWrapUp(e)
    if ('deny' in wrapUp) return wrapUp
    const { question } = wrapUp
    if (question === null) return { result: 'Nothing waits on the user, so nothing is shown for this call. Now write your full answer to the user.' }
    if (question.isBlocked) void $.ui.notify(question.ask).catch(() => undefined)
    if (e.tool_use_id !== undefined) {
      // One box per session: the newest call with a question is the only one drawn.
      await $.state.set(CURRENT, e.tool_use_id)
      await $.state.set(PENDING, { toolUseId: e.tool_use_id, recap: wrapUp.recap, question })
    }
    return {
      result: `The user sees your question "${question.ask}" with its buttons under your reply. Now write your full answer to the user, once, and end the turn; do not ask the question again in your text.`,
    }
  })

  // A prompt the user typed instead of pressing a button answers the box another way, so its question is no longer open.
  // A press arrives with a plugin origin, so it keeps its "You chose" line.
  on('prompt.submit', { origin: { kind: 'composer' } }, async ($, e, next) => {
    const current = await read($, CURRENT)
    if (current != null && (await read($, { ...ANSWER, id: current })) == null) {
      await $.state.set(CURRENT, null)
      await $.state.set(PENDING, null)
      await $.state.set(LAST, null)
    }
    return next(e)
  })

  // When the turn ends the box moves under its last reply text, so it comes after the whole reply,
  // whatever Claude wrote after the call. An error, or a transcript that never catches up, leaves it on its call's row.
  // A later turn with no box of its own moves a box not yet answered under its reply, so the box stays at the end.
  on('turn.complete', { reason: /[\s\S]*/ }, async ($, e, next) => {
    const since = Date.now() - e.durationMs
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const pending = await read($, PENDING)
    const last = pending ? null : await read($, LAST)
    const call = pending ?? last?.call
    if (!call) return result
    void (async () => {
      if (!pending && (await read($, { ...ANSWER, id: call.toolUseId })) != null) {
        await $.state.set(LAST, null)
        return
      }
      const anchor = e.reason === 'answer' || e.reason === 'aborted' ? await readTranscript($, jsonl => replyAnchor(jsonl, since, e.answer)) : null
      // The reply draws the box before its row stops drawing it, so no frame shows neither.
      if (anchor !== null && anchor !== 'behind') {
        await $.state.set({ ...AT, id: anchor.uuid }, call)
        await $.state.set({ ...IS_MOVED, id: call.toolUseId }, true)
        if (last?.anchor && last.anchor !== anchor.uuid) await $.state.set({ ...AT, id: last.anchor }, null)
        await $.state.set(LAST, { anchor: anchor.uuid, call })
      } else if (pending) await $.state.set(LAST, { anchor: null, call })
      await $.state.set(PENDING, null)
    })().catch(err => $.ui.log(`toolkit: could not move the next step box under the reply: ${String(err)}`, { to: 'debug' }))
    return result
  })

  on('ui.render', { surface: 'terminal', component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    const call = await read($, { ...AT, id: e.requestId })
    if (!call || call.toolUseId !== (await read($, CURRENT))) return next(e)
    const reply = await next(e)
    const elements = $.ui.resolve(e)
    const { Box } = elements
    return (
      <Box flexDirection="column">
        {reply}
        {await drawCall($, elements, call)}
      </Box>
    )
  })

  // The call's row draws the box from the call's own input, so it survives a reload and /resume.
  // While its turn runs, and once the box is under the reply, the row draws nothing.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: WRAP_UP_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isRunning || e.props.isErrored) return next(e)
    const wrapUp = parseWrapUp(e.props.input)
    if ('deny' in wrapUp) return next(e)
    const { Box } = $.ui.resolve(e)
    // As on Desktop, a turn with nothing pending draws no box, and no tool row either.
    if (wrapUp.question === null) return <Box />
    if ((await read($, CURRENT)) !== e.props.tool_use_id) return <Box />
    if ((await read($, PENDING))?.toolUseId === e.props.tool_use_id) return <Box />
    if (await read($, { ...IS_MOVED, id: e.props.tool_use_id })) return <Box />
    return drawCall($, $.ui.resolve(e), { toolUseId: e.props.tool_use_id, recap: wrapUp.recap, question: wrapUp.question })
  })

  // The box above already says it all, so the result the model read stays out of view.
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: WRAP_UP_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
