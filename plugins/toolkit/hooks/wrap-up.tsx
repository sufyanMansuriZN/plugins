import { read, update } from 'claude-code'
import type { Elements, Register } from 'claude-code'

import type { WrapUp, WrapUpQuestion } from '../types'

const NAME = 'wrap_up'
export const WRAP_UP_TOOL = `mcp__toolkit__${NAME}`

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

const DESCRIPTION = `Fill the "next step" box the terminal shows at the end of your turn: a two-or-three-sentence recap and, when this turn leaves the user a decision to make or a step to take, one question and buttons that answer it; a turn with nothing pending ends with the recap alone, and the terminal then draws no box. Call it once in EVERY turn in which you kept a task list, changed files, ran commands, or completed multi-step work, as the very last thing in the turn. Skip it for short answers, pure conversation, or a brief read-and-explain turn — a reply that names a follow-up is not brief: ask or propose it, and call this.

The recap never replaces your answer to the user. With a question: write your answer in full first, as ordinary text, then call this, and after it write only a single period (.), nothing else: the box is drawn where the call is, so it sits at the end of your reply where the user looks, and the terminal hides the period. Your reply above the box is visible to the user; never write it again. With the recap alone: nothing is drawn, so call this first and write your full answer after it, never a lone period. Ask the box's question only in the box, never also in your text.

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

export const register: Register = on => {
  // Desktop draws its own wrap_up, and a -p run has no one to press a button.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    return next(e)
  })
  on('tool.call', { tool: WRAP_UP_TOOL }, async ($, e) => {
    const wrapUp = parseWrapUp(e)
    if ('deny' in wrapUp) return wrapUp
    const { question } = wrapUp
    if (question === null) return { result: 'Nothing waits on the user, so nothing is shown for this call. Now write your full answer to the user; a lone period would leave them with no answer.' }
    if (question.isBlocked) void $.ui.notify(question.ask).catch(() => undefined)
    return {
      result: `The user sees your question "${question.ask}" with its buttons at the end of your reply, and your reply above it is visible. The box ends your turn: write only a single period (.) now, which the terminal hides. If you are later told your response had no visible output, write only a period again; never repeat your reply.`,
    }
  })

  // The call's row draws the box from the call's own input, so it survives a reload and /resume.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: WRAP_UP_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isRunning || e.props.isErrored) return next(e)
    const wrapUp = parseWrapUp(e.props.input)
    if ('deny' in wrapUp) return next(e)
    const { Box } = $.ui.resolve(e)
    // As on Desktop, a turn with nothing pending draws no box, and no tool row either.
    if (wrapUp.question === null) return <Box />
    const { question } = wrapUp
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
    return drawWrapUp($.ui.resolve(e), wrapUp.recap, question, answered, answer => void press(answer))
  })

  // The box above already says it all, so the result the model read stays out of view.
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: WRAP_UP_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
