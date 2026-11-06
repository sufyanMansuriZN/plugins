import { read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, SessionMessage } from 'claude-code'

import type { PlanStatus, PlanStep } from '../types'
import { readTranscript, replyAnchor } from './transcript'

const NAME = 'update_plan'
export const PLAN_TOOL = `mcp__toolkit__${NAME}`

const PLAN = { plugin: 'toolkit', key: 'plan' } as const
const IS_OPEN = { plugin: 'toolkit', key: 'planIsOpen' } as const
const AT = { plugin: 'toolkit', key: 'planAt' } as const
const STEPS_MAX = 12
const STATUSES: PlanStatus[] = ['pending', 'in_progress', 'completed']
// A long list shows five steps and a "… +N more" row, as Claude Code cuts its own lists short.
const STEP_ROWS = 6

const DESCRIPTION = `Keep the task list the terminal shows at the end of the transcript while you work. Every request that edits files or runs more than one command gets one (implement-and-test, investigate-then-fix, anything the user listed); only a single-command answer or pure conversation does not.

Never spend a message on this tool alone: send it IN THE SAME MESSAGE as another tool call (in parallel), so it costs no extra round trip.
- First call: with the VERY FIRST tool call of the turn, even one that only reads or lists files: {"items": [...]}, the whole plan in order, short imperative phrases (at most ~7 words, no numbering), the step you are starting "in_progress", the rest "pending". If you must look around first, make "Look at how X is set up" step one and refine the list once you know.
- Next step: {"advance": true} alongside the call that begins it (completes every in_progress step, starts the next pending one); after the last step, advance alongside wrap_up, and let your reply say what now works: the list goes away once every step is done.
- Out of order or in parallel: {"done": [2], "start": [4, 5]} (1-based; start also takes one number).
- Plan changed, including right after the user interrupts or sends a new instruction mid-task: {"items": [...]} again, the new whole list, so the list never shows an abandoned plan.
Mark in_progress the step you are working on, or every step that runs at the same time (parallel agents, sessions or background commands); none when everything is done. Do not also write the plan as a numbered list in your message: the list on screen is the plan.`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: STEPS_MAX,
      description: 'The whole plan, in order (1–12 steps); replaces the previous list.',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          status: { type: 'string', enum: STATUSES },
        },
        required: ['content', 'status'],
      },
    },
    advance: { type: 'boolean' },
    done: { type: 'array', items: { type: 'number' } },
    start: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
  },
}

const isStatus = (value: unknown): value is PlanStatus => STATUSES.includes(value as PlanStatus)
const isDone = (plan: PlanStep[]) => plan.every(step => step.status === 'completed')

function parseItems(items: unknown[]): PlanStep[] | { deny: string } {
  if (items.length < 1 || items.length > STEPS_MAX) return { deny: `Give 1 to ${STEPS_MAX} steps.` }
  const plan: PlanStep[] = []
  for (const [index, item] of items.entries()) {
    const { content, status } = (item ?? {}) as { content?: unknown; status?: unknown }
    if (typeof content !== 'string' || content.trim() === '') return { deny: `items[${index}] needs content.` }
    if (!isStatus(status)) return { deny: `items[${index}].status must be one of ${STATUSES.join(', ')}.` }
    plan.push({ content: content.trim(), status })
  }
  return plan
}

/** The plan after Claude's call, or the reason the call cannot apply to `plan`. */
export function applyPlan(plan: PlanStep[] | null, input: unknown): PlanStep[] | { deny: string } {
  const { items, advance, done, start } = (input ?? {}) as { items?: unknown; advance?: unknown; done?: unknown; start?: unknown }
  const next = Array.isArray(items) ? parseItems(items) : advance === true || done !== undefined || start !== undefined ? applyMoves(plan, advance === true, done, start) : { deny: 'Give items (the whole plan), advance, or done and start.' }
  // Several steps in progress at once is parallel work, such as agents or sessions running side by side.
  return next
}

function applyMoves(plan: PlanStep[] | null, advance: boolean, done: unknown, start: unknown): PlanStep[] | { deny: string } {
  if (plan === null) return { deny: 'There is no plan yet: send items, the whole plan, first.' }
  const restatus = (status: (step: PlanStep, index: number) => PlanStatus) => plan.map((step, index) => ({ ...step, status: status(step, index) }))
  if (advance) {
    // Every step in progress is done, parallel ones too, and the first one still to do starts.
    const following = plan.findIndex(step => step.status === 'pending')
    return restatus((step, index) => (step.status === 'in_progress' ? 'completed' : index === following ? 'in_progress' : step.status))
  }
  const isStep = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= plan.length
  const finished = Array.isArray(done) ? done : done === undefined ? [] : [done]
  const wrong = finished.find(n => !isStep(n))
  if (wrong !== undefined) return { deny: `done: ${String(wrong)} is not a step number (1–${plan.length}).` }
  const starting: unknown[] = Array.isArray(start) ? start : start === undefined ? [] : [start]
  const wrongStart = starting.find(n => !isStep(n))
  if (wrongStart !== undefined) return { deny: `start: ${String(wrongStart)} is not a step number (1–${plan.length}).` }
  return restatus((step, index) => {
    if (finished.includes(index + 1)) return 'completed'
    if (start === undefined) return step.status
    // The steps started are the ones in progress now; one in progress and not named goes back, unless it was just finished.
    return starting.includes(index + 1) ? 'in_progress' : step.status === 'in_progress' ? 'pending' : step.status
  })
}

/** The list the transcript's calls leave, and whether its last prompt's turn changed it: what a new process of the session starts from. */
export function replayPlan(messages: readonly SessionMessage[]): { steps: PlanStep[]; isLastTurn: boolean } | null {
  let plan: { steps: PlanStep[]; prompts: number } | null = null
  let prompts = 0
  for (const message of messages) {
    if (message.role === 'user' && !message.toolResults?.length) prompts++
    for (const use of message.toolUses) {
      if (use.tool !== PLAN_TOOL || use.isError) continue
      const next = applyPlan(plan?.steps ?? null, use.input)
      if (!('deny' in next)) plan = isDone(next) ? null : { steps: next, prompts }
    }
  }
  return plan && { steps: plan.steps, isLastTurn: plan.prompts === prompts }
}

/** What the model reads back: enough to pick up the plan after a compaction. */
function summary(plan: PlanStep[]): string {
  const count = plan.filter(step => step.status === 'completed').length
  const current = plan.flatMap((step, index) => (step.status === 'in_progress' ? [`${index + 1}: ${step.content}`] : []))
  const now = current.length === 1 ? ` Now on step ${current[0]}.` : current.length > 1 ? ` Now on steps ${current.join('; ')}.` : isDone(plan) ? ' All steps are done.' : ''
  return `Plan updated: ${count} of ${plan.length} done.${now}`
}

// Claude Code's own task list, as it draws under the spinner on models that have its task tools.
const MARKS: Record<PlanStatus, { mark: string; color?: 'success' | 'claude' }> = {
  pending: { mark: '◻' },
  in_progress: { mark: '◼', color: 'claude' },
  completed: { mark: '✔', color: 'success' },
}

/**
 * The steps a list of at most `rows` rows shows: the step in progress (or the first open one),
 * the one done before it, then what comes next.
 * A longer plan gives a row to the count it leaves out.
 */
export function windowSteps(plan: PlanStep[], rows: number): { shown: [number, PlanStep][]; hidden: number } {
  const all = plan.map((step, index): [number, PlanStep] => [index, step])
  if (plan.length <= rows) return { shown: all, hidden: 0 }
  const size = Math.max(1, rows - 1)
  const current = plan.findIndex(step => step.status === 'in_progress')
  const open = plan.findIndex(step => step.status !== 'completed')
  const anchor = current >= 0 ? current : open >= 0 ? open : plan.length - 1
  const first = Math.max(0, Math.min(anchor - 1, plan.length - size))
  return { shown: all.slice(first, first + size), hidden: plan.length - size }
}

/** Whether a long list shows every step, and what pressing its "… +N more" or "show less" row does. */
type Toggle = { isOpen: boolean; onPress: () => unknown }

// A plain dim link, as the next step box draws its answers; hover underlines the nearest keyed Box.
function toggleLink(elements: Elements['terminal'], label: string, toggle?: Toggle) {
  const { Box, Button, Text } = elements
  return toggle ? (
    <Box key="hover:toggle" paddingLeft={2}>
      <Button key="toggle" plain dimColor hover={{ underline: true }} label={label} onPress={async () => void (await toggle.onPress())} />
    </Box>
  ) : (
    <Text dimColor>{`  ${label}`}</Text>
  )
}

function drawSteps(elements: Elements['terminal'], plan: PlanStep[], rows: number, toggle?: Toggle) {
  const { Box, Text } = elements
  const isOpen = toggle?.isOpen === true
  const { shown, hidden } = windowSteps(plan, isOpen ? plan.length : rows)
  return (
    <Box flexDirection="column" flexGrow={1}>
      {shown.map(([index, step]) => (
        <Box key={`step:${index}`} flexDirection="row">
          <Text color={MARKS[step.status].color}>{`${MARKS[step.status].mark} `}</Text>
          <Text weight={step.status === 'in_progress' ? 'bold' : undefined} dimColor={step.status === 'completed'} strikethrough={step.status === 'completed'}>
            {step.content}
          </Text>
        </Box>
      ))}
      {hidden > 0 ? toggleLink(elements, `… +${hidden} more`, toggle) : isOpen ? toggleLink(elements, 'show less', toggle) : null}
    </Box>
  )
}

/** The list under the spinner while Claude works. */
export function drawPlan(elements: Elements['terminal'], plan: PlanStep[], toggle?: Toggle) {
  const { Box, Text } = elements
  return (
    <Box flexDirection="row">
      <Box width={5} minWidth={5}>
        <Text dimColor>{'  ⎿  '}</Text>
      </Box>
      {drawSteps(elements, plan, STEP_ROWS, toggle)}
    </Box>
  )
}

// The subagent whose transcript the person has in view, as the band above the prompt last saw it.
let viewedAgent: string | undefined

/** Puts the list under the reply row `find` picks in the transcript; a miss leaves it under the next turn's spinner only. */
async function anchorAt($: EngineInterface, find: (jsonl: string) => { uuid: string } | 'behind' | null) {
  const anchor = await readTranscript($, find)
  if (anchor !== null && anchor !== 'behind') await $.state.set(AT, anchor.uuid)
}

export const register: Register = on => {
  // Desktop pins its own list under the reply, and a -p run has no transcript to draw in.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    // State lives only as long as the process, so a resumed, forked or restarted session reads its list back from its calls.
    // The new process counts its turns afresh: a list the last turn changed shows under the last reply until the next one.
    // In the background, so a failure here never keeps the tools after this one from starting.
    void (async () => {
      if ((await read($, PLAN)) != null) return
      const plan = replayPlan(await $.session.messages())
      if (!plan) return
      await $.state.set(PLAN, { steps: plan.steps, prompts: plan.isLastTurn ? await $.session.turns() : -1 })
      if (plan.isLastTurn) await anchorAt($, jsonl => replyAnchor(jsonl, 0, ''))
    })().catch(err => $.ui.log(`toolkit: could not bring back the task list: ${String(err)}`, { to: 'debug' }))
    return next(e)
  })
  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    // A subagent sees the tool too, but the list and its state are the main conversation's.
    if (e.agentId !== undefined) return { result: "The task list shows the main conversation's plan only, so a subagent's call changes nothing. Say what you did in your final report." }
    let result: PlanStep[] | { deny: string } = { deny: 'The plan could not be saved.' }
    const prompts = await $.session.turns()
    // A list with every step done goes away at once.
    await update($, PLAN, was => {
      result = applyPlan(was?.steps ?? null, e)
      return 'deny' in result ? (was ?? null) : isDone(result) ? null : { steps: result, prompts }
    })
    return 'deny' in result ? result : { result: summary(result) }
  })

  // Only the band above the prompt is told whose transcript is in view; the spinner reads it from here.
  on('ui.render', { surface: 'terminal', component: 'AbovePrompt' }, async (_$, e, next) => {
    viewedAgent = e.props.view?.agentId
    return next(e)
  })

  // Where Claude Code draws its own task list: under the spinner, so it shows only while the turn runs.
  // An unfinished list comes back with the next turn's spinner; a new list replaces it.
  // A rewind sends no event: it only takes prompts out of the transcript, the one the list was made under too.
  // A subagent's transcript in view gets its own spinner, without the main conversation's list.
  on('ui.render', { surface: 'terminal', component: 'Spinner' }, async ($, e, next) => {
    const plan = await read($, PLAN)
    if (!plan || viewedAgent !== undefined || (await $.session.turns()) < plan.prompts) return next(e)
    const isOpen = (await read($, IS_OPEN)) === true
    const spinner = await next(e)
    const elements = $.ui.resolve(e)
    const { Box } = elements
    return (
      <Box flexDirection="column">
        {spinner}
        {drawPlan(elements, plan.steps, { isOpen, onPress: () => update($, IS_OPEN, was => !was) })}
      </Box>
    )
  })

  // A turn that changed the list and ends with steps still open is not done: the list goes under the turn's
  // last reply text, at the end of the transcript, until the next turn starts. One the turn left alone, set
  // aside or not, stays under the spinner only.
  on('turn.start', { text: /[\s\S]*/ }, async ($, e, next) => {
    if (e.agentId === undefined) await $.state.set(AT, null)
    return next(e)
  })
  on('turn.complete', { reason: /[\s\S]*/ }, async ($, e, next) => {
    const since = Date.now() - e.durationMs
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const plan = await read($, PLAN)
    if (!plan || plan.prompts !== (await $.session.turns())) return result
    // An error leaves no answer to wait for, so the turn's last text stands.
    const answer = e.reason === 'answer' || e.reason === 'aborted' ? e.answer : ''
    void anchorAt($, jsonl => replyAnchor(jsonl, since, answer)).catch(err => $.ui.log(`toolkit: could not move the task list under the reply: ${String(err)}`, { to: 'debug' }))
    return result
  })
  on('ui.render', { surface: 'terminal', component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary || (await read($, AT)) !== e.requestId) return next(e)
    const plan = await read($, PLAN)
    if (!plan) return next(e)
    const isOpen = (await read($, IS_OPEN)) === true
    const reply = await next(e)
    const elements = $.ui.resolve(e)
    const { Box } = elements
    return (
      <Box flexDirection="column">
        {reply}
        <Box paddingLeft={2} marginTop={1}>
          {drawSteps(elements, plan.steps, STEP_ROWS, { isOpen, onPress: () => update($, IS_OPEN, was => !was) })}
        </Box>
      </Box>
    )
  })

  // The list shows each change, so the calls stay out of the transcript.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: PLAN_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool: PLAN_TOOL } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
