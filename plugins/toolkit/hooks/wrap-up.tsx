import { read, update } from 'claude-code'
import type { Elements, Register } from 'claude-code'

import type { WrapUp } from '../types'

const NAME = 'wrap_up'
export const WRAP_UP_TOOL = `mcp__toolkit__${NAME}`

const LABEL_MAX = 24
const ASK_MAX = 100

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

const DESCRIPTION = `Show the "next step" line the terminal draws at the end of your turn: one question for the user, with one or two buttons that answer it, under a short line of context. A press sends the button's label, exactly as the user sees it, as the user's answer to your question.

Call it only when this turn leaves the user a decision that the buttons can answer: a choice of approach, a go-ahead to fix, commit, push, post or send, an approval. Call it once, when this turn's work is done, before your closing message. Do not call it when nothing waits on the user, and never only to summarize: a turn with no decision ends with your message alone.

Your closing message is ordinary text right after this call, the last thing you say this turn: your answer to the user in full. Do not repeat the recap or the question in it, and do not ask the question again.

Fields. recap and ask are said to the user, in the second person. A reply button's label is the user's whole answer back to you, so it must make sense on its own as a reply to ask.
- recap: one or two short sentences of context for the question: what is now true, and what is not done or not verified (for example: nothing committed). About 200 characters, in the project's own words. No recommendation here.
- ask: just that ONE decision in one short sentence, never two joined by "and" ("Which fix first?"), with no reason or recommendation and without listing the options the buttons give. Your pick, actions[0], is drawn first. At most 100 characters.
Every field is a top-level parameter holding plain prose (actions: a JSON array); none contains markup or another field.`

const REMINDER = `Next step box: when your reply would end by asking the user to choose or approve something (a "Next: tell me whether …" line, "Want me to …?", "Should I …?", "X or Y?"), do not write that question as text. Call ${WRAP_UP_TOOL} with the question and 1 or 2 answer labels, then write your closing message without the question. This holds in long sessions and after skills or other instructions that shape your reply. Skip the tool only when nothing waits on the user.`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    recap: {
      type: 'string',
      description:
        'One or two short sentences of context for the question (about 200 characters): what is now true, and what is not done or not verified.',
    },
    ask: {
      type: 'string',
      maxLength: ASK_MAX,
      description:
        'The one question the user decides (a choice, a go-ahead, an approval): the decision alone, with no reason or recommendation and without listing the options the buttons give (actions[0] is your pick).',
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
  required: ['recap', 'ask', 'actions'],
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
  const noDecision = 'Call wrap_up only when the user has a decision to make: give ask and 1 or 2 actions. With nothing to decide, end the turn with your message alone.'
  if (typeof recap !== 'string' || recap.trim() === '') return { deny: 'recap is required: one or two sentences of context for the question.' }
  if (typeof ask !== 'string' || ask.trim() === '' || !Array.isArray(actions) || actions.length === 0) return { deny: noDecision }
  if (ask.length > ASK_MAX) return { deny: `ask must be at most ${ASK_MAX} characters.` }
  if (actions.length > 2) return { deny: 'Give at most 2 actions: your pick first, then one realistic alternative.' }
  const answers: string[] = []
  for (const [index, item] of actions.entries()) {
    const answer = parseAnswer(item, index)
    if (typeof answer === 'string') return { deny: answer }
    answers.push(answer.label)
  }
  return { recap, ask, answers, isBlocked: blocked === true }
}

/** The whole look of the box: swap this to change the layout. `answered` is the label pressed. */
export function drawWrapUp(elements: Elements['terminal'], wrapUp: WrapUp, answered: string | null, onPress: (answer: string) => void) {
  const { Box, Button, Text } = elements
  // Plain dim links like table copy's; hover underlines the nearest keyed Box, so each gets its own.
  const links = wrapUp.answers.flatMap((answer, index) => {
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
        <Text>{`${wrapUp.ask}  `}</Text>
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
          <Text>{wrapUp.recap}</Text>
          {choice}
        </Box>
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  let isOffered = false

  // Desktop draws its own wrap_up, and a -p run has no one to press a button.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    isOffered = true
    return next(e)
  })

  // In a long session the tool's description alone loses to the habit of a text "Next:" line, so the
  // rule rides with each prompt. Not the system prompt: the built-in security guard skips a plugin's
  // prompt.compose hook.
  on('prompt.submit', async ($, e, next) => {
    if (!isOffered) return next(e)
    return next({ ...e, context: [...(e.context ?? []), REMINDER] })
  })

  on('tool.call', { tool: WRAP_UP_TOOL }, async ($, e) => {
    const wrapUp = parseWrapUp(e)
    if ('deny' in wrapUp) return wrapUp
    if (wrapUp.isBlocked) void $.ui.notify(wrapUp.ask).catch(() => undefined)
    return {
      result: `The user sees your question "${wrapUp.ask}" with its buttons. Write your closing message now, without repeating the recap or asking the question again.`,
    }
  })

  // The call's row draws the box from the call's own input, so it survives a reload and /resume.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: WRAP_UP_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isRunning || e.props.isErrored) return next(e)
    const wrapUp = parseWrapUp(e.props.input)
    if ('deny' in wrapUp) return next(e)
    const answerRef = { plugin: 'toolkit', key: 'wrapUpAnswer', id: e.props.tool_use_id } as const
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
    return drawWrapUp($.ui.resolve(e), wrapUp, answered, answer => void press(answer))
  })

  // The box above already says it all, so the result the model read stays out of view.
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: WRAP_UP_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
