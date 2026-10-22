import { read, update } from 'claude-code'
import type { Elements, Register } from 'claude-code'

import type { PlanStatus, PlanStep } from '../types'

const NAME = 'update_plan'
export const PLAN_TOOL = `mcp__toolkit__${NAME}`

const PLAN = { plugin: 'toolkit', key: 'plan' } as const
const STEPS_MAX = 12
const STATUSES: PlanStatus[] = ['pending', 'in_progress', 'completed']
// A long list shows five steps and a "… +N more" row, as Claude Code cuts its own lists short.
const STEP_ROWS = 6
// Above the prompt the list leaves room for its count and a status bar's row.
const BAND_ROWS = 2

const DESCRIPTION = `Keep the task list the terminal shows above the prompt while you work. Every request that edits files or runs more than one command gets one (implement-and-test, investigate-then-fix, anything the user listed); only a single-command answer or pure conversation does not.

Never spend a message on this tool alone: send it IN THE SAME MESSAGE as another tool call (in parallel), so it costs no extra round trip.
- First call: with the VERY FIRST tool call of the turn, even one that only reads or lists files: {"items": [...]}, the whole plan in order, short imperative phrases (at most ~7 words, no numbering), the step you are starting "in_progress", the rest "pending". If you must look around first, make "Look at how X is set up" step one and refine the list once you know.
- Next step: {"advance": true} alongside the call that begins it (completes the in_progress step, starts the next pending one); after the last step, advance alongside wrap_up.
- Out of order: {"done": [2], "start": 4} (1-based).
- Plan changed, including right after the user interrupts or sends a new instruction mid-task: {"items": [...]} again, the new whole list, so the list never shows an abandoned plan.
Keep exactly one step in_progress while working and none when everything is done. Do not also write the plan as a numbered list in your message: the list above the prompt is the plan.`

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
    start: { type: 'number' },
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
  if ('deny' in next) return next
  if (next.filter(step => step.status === 'in_progress').length > 1) return { deny: 'Keep exactly one step in_progress.' }
  return next
}

function applyMoves(plan: PlanStep[] | null, advance: boolean, done: unknown, start: unknown): PlanStep[] | { deny: string } {
  if (plan === null) return { deny: 'There is no plan yet: send items, the whole plan, first.' }
  const restatus = (status: (step: PlanStep, index: number) => PlanStatus) => plan.map((step, index) => ({ ...step, status: status(step, index) }))
  if (advance) {
    const current = plan.findIndex(step => step.status === 'in_progress')
    const following = plan.findIndex(step => step.status === 'pending')
    return restatus((step, index) => (index === current ? 'completed' : index === following ? 'in_progress' : step.status))
  }
  const isStep = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= plan.length
  const finished = Array.isArray(done) ? done : done === undefined ? [] : [done]
  const wrong = finished.find(n => !isStep(n))
  if (wrong !== undefined) return { deny: `done: ${String(wrong)} is not a step number (1–${plan.length}).` }
  if (start !== undefined && !isStep(start)) return { deny: `start: ${String(start)} is not a step number (1–${plan.length}).` }
  return restatus((step, index) => {
    if (finished.includes(index + 1)) return 'completed'
    if (start === undefined) return step.status
    // Starting another step puts the one in progress back, unless it was just finished.
    return index + 1 === start ? 'in_progress' : step.status === 'in_progress' ? 'pending' : step.status
  })
}

/** What the model reads back: enough to pick up the plan after a compaction. */
function summary(plan: PlanStep[]): string {
  const count = plan.filter(step => step.status === 'completed').length
  const current = plan.findIndex(step => step.status === 'in_progress')
  const now = current >= 0 ? ` Now on step ${current + 1}: ${plan[current]?.content}.` : isDone(plan) ? ' All steps are done.' : ''
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
 * the one done before it, then what comes next. A longer plan gives a row to the count it leaves out.
 */
export function windowSteps(plan: PlanStep[], rows: number): { shown: [number, PlanStep][]; hidden: number } {
  const all = plan.map((step, index): [number, PlanStep] => [index, step])
  if (plan.length <= rows) return { shown: all, hidden: 0 }
  const size = Math.max(1, rows - 1)
  const current = plan.findIndex(step => step.status === 'in_progress')
  const anchor = current >= 0 ? current : Math.max(0, plan.findIndex(step => step.status !== 'completed'))
  const first = Math.max(0, Math.min(anchor - 1, plan.length - size))
  return { shown: all.slice(first, first + size), hidden: plan.length - size }
}

function drawSteps(elements: Elements['terminal'], plan: PlanStep[], rows: number) {
  const { Box, Text } = elements
  const { shown, hidden } = windowSteps(plan, rows)
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
      {hidden > 0 ? <Text dimColor>{`  … +${hidden} more`}</Text> : null}
    </Box>
  )
}

/** The list under the spinner while Claude works. */
export function drawPlan(elements: Elements['terminal'], plan: PlanStep[]) {
  const { Box, Text } = elements
  return (
    <Box flexDirection="row">
      <Box width={5} minWidth={5}>
        <Text dimColor>{'  ⎿  '}</Text>
      </Box>
      {drawSteps(elements, plan, STEP_ROWS)}
    </Box>
  )
}

/** The list above the prompt once Claude stops with steps still open, in at most `rows` rows besides its count. */
export function drawOpenPlan(elements: Elements['terminal'], plan: PlanStep[], rows: number) {
  const { Box, Text } = elements
  const done = plan.filter(step => step.status === 'completed').length
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box flexDirection="row">
        <Text dimColor weight="bold">{String(plan.length)}</Text>
        <Text dimColor>{' tasks ('}</Text>
        <Text dimColor weight="bold">{String(done)}</Text>
        <Text dimColor>{' done, '}</Text>
        <Text dimColor weight="bold">{String(plan.length - done)}</Text>
        <Text dimColor>{' open)'}</Text>
      </Box>
      {drawSteps(elements, plan, rows)}
    </Box>
  )
}

export const register: Register = on => {
  // Desktop pins its own list under the reply, and a -p run has no band to draw in.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    return next(e)
  })
  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    let result: PlanStep[] | { deny: string } = { deny: 'The plan could not be saved.' }
    const prompts = await $.session.turns()
    await update($, PLAN, was => {
      result = applyPlan(was?.steps ?? null, e)
      return 'deny' in result ? (was ?? null) : { steps: result, prompts }
    })
    return 'deny' in result ? result : { result: summary(result) }
  })

  // Claude Code keeps an unfinished list above the prompt once the turn stops, and a finished one goes.
  // A rewind sends no event: it only takes prompts out of the transcript, the one the list was made under too.
  on('ui.render', { surface: 'terminal', component: 'AbovePrompt' }, async ($, e, next) => {
    const plan = await read($, PLAN)
    if (e.props.hasSurvey || e.props.isWorking || !plan || isDone(plan.steps) || (await $.session.turns()) < plan.prompts) return next(e)
    const below = await next(e)
    const elements = $.ui.resolve(e)
    const { Box } = elements
    return (
      <Box flexDirection="column">
        {drawOpenPlan(elements, plan.steps, Math.min(STEP_ROWS, e.props.maxRows - BAND_ROWS))}
        {below}
      </Box>
    )
  })

  // As on Desktop, a list belongs to the request that sent it, so a plan Claude dropped halfway
  // never sits under the next one. A turn a background task wakes, or a message typed while
  // Claude works, goes on with the same request and keeps the list.
  let isWorking = false
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) isWorking = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) isWorking = false
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    if (!isWorking && e.origin.kind === 'composer') await update($, PLAN, () => null)
    return next(e)
  })

  // Where Claude Code draws its own task list: under the spinner, so it shows while the turn runs.
  on('ui.render', { surface: 'terminal', component: 'Spinner' }, async ($, e, next) => {
    const plan = await read($, PLAN)
    if (!plan || (await $.session.turns()) < plan.prompts) return next(e)
    const spinner = await next(e)
    const elements = $.ui.resolve(e)
    const { Box } = elements
    return (
      <Box flexDirection="column">
        {spinner}
        {drawPlan(elements, plan.steps)}
      </Box>
    )
  })

  // The list above the prompt shows each change, so the calls stay out of the transcript.
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
