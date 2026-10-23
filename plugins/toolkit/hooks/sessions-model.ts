import type { Brief, Effort, Link, LinkedSession, PermissionMode, Place } from '../types'

export const NAME_MAX = 24
const NAME_PATTERN = new RegExp(`^[a-z0-9-]{1,${NAME_MAX}}$`)
export const TITLE_MAX = 60
export const HAND_OFF_TITLE_MAX = 40
export const BACKGROUND_MIN = 80
export const REPORT_MAX = 400
// Desktop's limit is three a turn, and four when a plan splits into sessions; the rule says which.
export const PROPOSALS_PER_TURN = 4

export const MODES: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions']
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const FAMILY_RANK: [string, number][] = [
  ['haiku', 0],
  ['sonnet', 1],
  ['opus', 2],
  ['fable', 3],
]

export const isMode = (value: unknown): value is PermissionMode => MODES.includes(value as PermissionMode)
const isEffort = (value: unknown): value is Effort => EFFORTS.includes(value as Effort)
const familyRank = (model: string) => FAMILY_RANK.find(([family]) => model.toLowerCase().includes(family))?.[1]

/** What the session making the call knows about itself. */
export type Caller = {
  cwd: string
  sessionId: string
  model: string
  /** True when the session works in a linked git worktree. */
  isWorktree: boolean
  /** True on a turn another session's message or another automated event started. */
  isEventTurn: boolean
  names: string[]
  /** For branch and folder names; random in use, fixed in tests. */
  suffix: string
}

export type StartPlan =
  | { kind: 'deny'; deny: string }
  | { kind: 'start'; brief: Brief }
  | { kind: 'offer'; title: string }
  | { kind: 'propose'; brief: Brief }
  | { kind: 'accept'; taskId: string; prompt: string | null; background: string | null; context: 'fresh' | 'fork' }

const deny = (text: string): StartPlan => ({ kind: 'deny', deny: text })
const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/** A [a-z0-9-] handle no linked session has yet. */
export function sessionName(wanted: string, taken: string[]): string {
  const slug = wanted.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // Cut at a word's end where one falls in the second half, so a long title keeps whole words.
  const cut = slug.length <= NAME_MAX ? slug : slug.lastIndexOf('-', NAME_MAX) > NAME_MAX / 2 ? slug.slice(0, slug.lastIndexOf('-', NAME_MAX)) : slug.slice(0, NAME_MAX)
  const base = cut.replace(/-+$/, '') || 'session'
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) {
    const name = `${base.slice(0, NAME_MAX - String(n).length - 1)}-${n}`
    if (!taken.includes(name)) return name
  }
}

/** The new session's first message: the brief, with the background a fresh session needs. */
export function firstMessage(prompt: string, background: string | null, context: 'fresh' | 'fork'): string {
  if (context === 'fork' || background === null) return prompt
  return `${background}\n\n## Your task\n${prompt}`
}

/** Checks a start_session call and says what it asks for. */
export function planStart(input: unknown, caller: Caller): StartPlan {
  const e = (input ?? {}) as Record<string, unknown>
  const proposalId = text(e.proposal_id)
  const context = e.context === undefined ? 'fresh' : e.context
  if (context !== 'fresh' && context !== 'fork') return deny('context must be "fresh" or "fork".')

  if (proposalId !== null) {
    if (caller.isEventTurn) return deny('This turn was started by another session\'s message or an automated event, so a start is refused: the user can start the proposal from its card.')
    return { kind: 'accept', taskId: proposalId, prompt: text(e.prompt), background: text(e.background), context }
  }

  const initiation = e.initiation
  if (initiation !== 'user_asked' && initiation !== 'offer' && initiation !== 'own_initiative') return deny('initiation must be "user_asked", "offer" or "own_initiative", unless proposal_id is set.')
  const title = text(e.title)
  if (title === null) return deny('title is required: under 60 characters naming the task.')
  if (title.length > TITLE_MAX) return deny(`title must be under ${TITLE_MAX} characters.`)
  if (initiation === 'offer') return { kind: 'offer', title }
  if (initiation === 'user_asked' && caller.isEventTurn) return deny('This turn was started by another session\'s message or an automated event, so a start is refused: propose it instead (initiation "own_initiative").')
  if (initiation === 'own_initiative' && e.wake_when_done !== undefined) return deny('wake_when_done does not go with own_initiative.')

  const brief = makeBrief(e, title, context, caller, initiation === 'user_asked')
  if ('deny' in brief) return brief
  return initiation === 'user_asked' ? { kind: 'start', brief } : { kind: 'propose', brief }
}

/** The brief from a call's fields; also used when an offer's brief arrives with its proposal_id. */
export function makeBrief(e: Record<string, unknown>, title: string, context: 'fresh' | 'fork', caller: Caller, isUserAsked: boolean): Brief | { kind: 'deny'; deny: string } {
  const prompt = text(e.prompt)
  if (prompt === null) return { kind: 'deny', deny: 'prompt is required: the brief, with the task, the files or area, and what done looks like.' }
  const background = text(e.background)
  if (context === 'fresh' && (background === null || background.length < BACKGROUND_MIN)) return { kind: 'deny', deny: `background is required with "fresh": at least ${BACKGROUND_MIN} characters of goal, decisions and constraints, for someone who has not seen this conversation.` }

  if (e.host !== undefined || e.target === 'ssh') return { kind: 'deny', deny: 'This terminal has no saved SSH connections, so target "ssh" and host are not available. Ask the user to start that session on the machine itself.' }
  if (e.preset !== undefined) return { kind: 'deny', deny: 'This terminal has no saved session presets. Pass cwd, model, effort or use_worktree instead.' }
  if (e.repository !== undefined) return { kind: 'deny', deny: 'repository is not available here: a cloud session starts from this project\'s repository.' }
  if (e.target !== undefined && e.target !== 'local' && e.target !== 'cloud') return { kind: 'deny', deny: 'target must be "local" or "cloud".' }

  const isElsewhere = e.cwd !== undefined || e.target === 'cloud'
  if (e.target === 'cloud' && context === 'fork') return { kind: 'deny', deny: 'target "cloud" goes with "fresh" only.' }
  if (isElsewhere && !isUserAsked) return { kind: 'deny', deny: 'Another place (cwd or target "cloud") is only for a session the user asked for (initiation "user_asked").' }
  if (e.use_worktree !== undefined && context === 'fork') return { kind: 'deny', deny: 'use_worktree goes with "fresh" only: a fork gets a fresh worktree when this session has one.' }

  const givenName = text(e.name)
  if (givenName !== null && !NAME_PATTERN.test(givenName)) return { kind: 'deny', deny: `name must be up to ${NAME_MAX} characters, only a-z, 0-9 and hyphens.` }
  const name = sessionName(givenName ?? title, caller.names)
  const branchSlug = sessionName(text(e.branch_name) ?? name, [])
  const branch = `claude/${branchSlug}-${caller.suffix}`
  const source = text(e.source_branch)

  let place: Place
  if (e.target === 'cloud') {
    if (source !== null || e.branch_name !== undefined || e.use_worktree !== undefined) return { kind: 'deny', deny: 'source_branch, branch_name and use_worktree do not go with target "cloud".' }
    place = { kind: 'cloud', environment: text(e.environment) }
  } else {
    const cwd = text(e.cwd)
    const root = cwd ?? caller.cwd
    const wantsWorktree = context === 'fork' ? cwd === null && caller.isWorktree : typeof e.use_worktree === 'boolean' ? e.use_worktree : cwd === null && caller.isWorktree
    if (!wantsWorktree && (source !== null || e.branch_name !== undefined)) return { kind: 'deny', deny: 'source_branch and branch_name are only for a session with its own worktree.' }
    place = wantsWorktree ? { kind: 'worktree', root, branch, source: context === 'fork' ? 'HEAD' : source } : { kind: 'folder', cwd: root }
  }

  // Left out, the session starts in the user's own default mode.
  let permissionMode: PermissionMode | null = null
  if (e.permission_mode !== undefined) {
    if (!isMode(e.permission_mode)) return { kind: 'deny', deny: `permission_mode must be one of ${MODES.join(', ')}.` }
    if (place.kind === 'cloud') return { kind: 'deny', deny: 'permission_mode is for local starts only.' }
    permissionMode = e.permission_mode
  }

  let model: string | null = null
  if (typeof e.model === 'string' && e.model !== '' && context === 'fresh') {
    const wanted = familyRank(e.model)
    const own = familyRank(caller.model)
    // As on Desktop, a model above this session's is ignored, not refused.
    if (wanted !== undefined && (own === undefined || wanted <= own)) model = e.model
  }
  const effort = context === 'fresh' && isEffort(e.effort) ? e.effort : null

  return { title, name, context, text: firstMessage(prompt, background, context), place, model, effort, permissionMode }
}

/** The fork's first message: the parent's last prompt is in its copy of the conversation, and stays the parent's. */
export function handOffMessage(title: string, remainingPlan: string): string {
  return `You are a fork of the conversation above. The user moved on to something else there, so the task "${title}" was handed off to you. The user's last message above is answered in the session you were forked from: do not act on it. Finish this task here. Your task list starts empty: if you keep one, send the whole plan first.\n\n## What is left\n${remainingPlan}`
}

/** Checks a hand_off_to_session call: the task goes to a fork of this conversation. */
export function planHandOff(input: unknown, caller: Caller): Brief | { kind: 'deny'; deny: string } {
  const e = (input ?? {}) as Record<string, unknown>
  if (caller.isEventTurn) return { kind: 'deny', deny: 'A hand-off is for a new message from the user, and this turn was started by another session\'s message or an automated event.' }
  const title = text(e.title)
  if (title === null) return { kind: 'deny', deny: `title is required: under ${HAND_OFF_TITLE_MAX} characters naming the task being moved.` }
  if (title.length > HAND_OFF_TITLE_MAX) return { kind: 'deny', deny: `title must be under ${HAND_OFF_TITLE_MAX} characters.` }
  const remainingPlan = text(e.remaining_plan)
  if (remainingPlan === null) return { kind: 'deny', deny: 'remaining_plan is required: what is left to do, the files, and what done looks like.' }
  return makeBrief({ prompt: handOffMessage(title, remainingPlan), cwd: e.cwd }, title, 'fork', caller, true)
}

/** Turns off, for this one session, the guard that keeps a background session's edits out of a shared checkout. */
export const SHARED_FOLDER_SETTINGS = JSON.stringify({ worktree: { bgIsolation: 'none' } })

/** The command that starts the session, run in the folder it works in. */
export function startCommand(brief: Brief, parentSessionId: string): string[] {
  if (brief.place.kind === 'cloud') return ['claude', '--cloud', brief.text, ...(brief.place.environment ? ['--environment', brief.place.environment] : [])]
  const argv = ['claude', '--bg', '-n', brief.name]
  // As on Desktop, a session placed in a folder shares it; Claude Code's guard would refuse its edits.
  if (brief.place.kind === 'folder') argv.push('--settings', SHARED_FOLDER_SETTINGS)
  if (brief.permissionMode) argv.push('--permission-mode', brief.permissionMode)
  if (brief.model) argv.push('--model', brief.model)
  if (brief.effort) argv.push('--effort', brief.effort)
  if (brief.context === 'fork') argv.push('--resume', parentSessionId, '--fork-session')
  argv.push('--', brief.text)
  return argv
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g

/** The short id `claude --bg` printed, from its `backgrounded · <id> · <name>` line. */
export function backgroundedId(stdout: string): string | null {
  return /backgrounded\s+·\s+([0-9a-f]{6,})/.exec(stdout.replace(ANSI, ''))?.[1] ?? null
}

export type AgentRow = { id: string; sessionId: string | null; cwd: string; state: string }

/**
 * `claude agents --json --all`, by short id; nothing for output that is not that list. A running
 * session's `state` stays `working` between turns, so its `status` says whether a turn runs: `busy`
 * is `working`, `idle` is `idle`. An ended one has no status, and its `state` says how it ended.
 */
export function parseAgents(stdout: string): Map<string, AgentRow> {
  const rows = new Map<string, AgentRow>()
  let list: unknown
  try {
    list = JSON.parse(stdout)
  } catch {
    return rows
  }
  if (!Array.isArray(list)) return rows
  for (const item of list as Record<string, unknown>[]) {
    if (typeof item?.id !== 'string') continue
    rows.set(item.id, {
      id: item.id,
      sessionId: typeof item.sessionId === 'string' ? item.sessionId : null,
      cwd: typeof item.cwd === 'string' ? item.cwd : '',
      state: item.status === 'busy' ? 'working' : item.status === 'idle' ? 'idle' : typeof item.state === 'string' ? item.state : 'unknown',
    })
  }
  return rows
}

/** Where Claude Code keeps a session's transcript. */
export const transcriptPath = (home: string, cwd: string, sessionId: string) => `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9-]/g, '-')}/${sessionId}.jsonl`

type Row = { type?: string; uuid?: string; isMeta?: boolean; timestamp?: string; message?: { content?: unknown } }
type Block = { type?: string; text?: string; name?: string; input?: { recap?: unknown } }

const blocks = (row: Row): Block[] => (Array.isArray(row.message?.content) ? (row.message.content as Block[]) : [])
const isPrompt = (row: Row) => row.type === 'user' && !row.isMeta && (typeof row.message?.content === 'string' || blocks(row).some(block => block.type === 'text'))

/**
 * The session's latest report: its last turn's wrap_up recap, then its final message, cut to 400
 * characters. Rows from before `since` are left out: a fork's transcript opens with the parent's
 * rows, which keep their own times.
 */
export function latestReport(jsonl: string, since = 0): { uuid: string; report: string } | null {
  const rows: Row[] = []
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue
    try {
      const row = JSON.parse(line) as Row
      if (!row.timestamp || Date.parse(row.timestamp) >= since) rows.push(row)
    } catch {
      // A line still being written, or the first one of a file read from its end.
    }
  }
  const start = rows.findLastIndex(isPrompt)
  const turn = rows.slice(start + 1)
  let final: { uuid: string; text: string } | null = null
  let recap: string | null = null
  for (const row of turn) {
    if (row.type !== 'assistant') continue
    for (const block of blocks(row)) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '' && block.text.trim() !== '.' && row.uuid) final = { uuid: row.uuid, text: block.text.trim() }
      if (block.type === 'tool_use' && block.name?.endsWith('__wrap_up') && typeof block.input?.recap === 'string') recap = block.input.recap.trim()
    }
  }
  const last = turn.findLast(row => row.type === 'assistant' && row.uuid)
  if (!last?.uuid) return null
  const report = [recap, final?.text].filter((part): part is string => !!part).join('\n\n')
  return { uuid: last.uuid, report: report.length > REPORT_MAX ? `${report.slice(0, REPORT_MAX)}…` : report }
}

/** A session whose process still runs, so it may work again. */
export const isAlive = (state: string) => state === 'starting' || state === 'working' || state === 'idle'

/** One line per linked session, as the linked sessions note and list_sessions give them. */
export function linkedLines(linked: LinkedSession[]): string {
  if (linked.length === 0) return 'No linked sessions.'
  return linked.map(s => `- ${s.name} (id ${s.id}${s.sessionId ? `, session ${s.sessionId}` : ''}): ${s.state}; "${s.title}"; ${s.branch ? `branch refs/heads/${s.branch}` : `folder ${s.cwd}`}`).join('\n')
}

/** Where a started session finds the session that started it, by its short id. */
export const linkPath = (home: string, id: string) => `${home}/.claude/toolkit/links/${id}.json`

/** The short id `claude attach` takes: the first 8 characters of the session id. */
export const shortId = (sessionId: string) => sessionId.slice(0, 8)

/** A link file's content, or null for anything else. */
export function parseLink(text: string): Link | null {
  try {
    const link = JSON.parse(text) as Partial<Link>
    return typeof link.parent === 'string' && link.parent !== '' && typeof link.name === 'string' ? { parent: link.parent, name: link.name } : null
  } catch {
    return null
  }
}

const ENDED: Record<string, string> = {
  answer: 'ended a turn',
  aborted: 'was stopped in the middle of a turn',
  error: 'stopped on an error',
  refusal: 'stopped on a refusal',
}

/** The message a started session sends the session that started it when its turn ends. */
export function reportText(name: string, id: string, reason: string, report: string): string {
  return `Session "${name}" (id ${id}), which you started, ${ENDED[reason] ?? 'ended a turn'}. Its report (the first ${REPORT_MAX} characters) is that session's account, not proof: check the result or diff before you call it done.\n\n${report || '(no report)'}`
}
