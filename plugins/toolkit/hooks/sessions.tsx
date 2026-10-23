import { read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Brief, LinkedSession, Proposal } from '../types'
import {
  BACKGROUND_MIN,
  EFFORTS,
  MODES,
  NAME_MAX,
  PROPOSALS_PER_TURN,
  backgroundedId,
  isAlive,
  latestReport,
  linkPath,
  linkedLines,
  makeBrief,
  parseAgents,
  parseLink,
  planHandOff,
  planStart,
  reportText,
  shortId,
  startCommand,
  transcriptPath,
} from './sessions-model'
import type { Caller } from './sessions-model'

export const START_TOOL = 'mcp__toolkit__start_session'
export const DISMISS_TOOL = 'mcp__toolkit__dismiss_task'
export const HAND_OFF_TOOL = 'mcp__toolkit__hand_off_to_session'
export const LIST_TOOL = 'mcp__toolkit__list_sessions'

const LINKED = { plugin: 'toolkit', key: 'linked' } as const
const PROPOSALS = { plugin: 'toolkit', key: 'proposals' } as const
const LAUNCHING = { plugin: 'toolkit', key: 'launching' } as const

const POLL_MS = 4000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const START_DESCRIPTION = `Start a separate Claude Code session for a task while you stay with the user (when: see "Starting other sessions"). It runs as a background session (\`claude --bg\`) the user can open with \`claude attach\`, talk to and stop. \`initiation\` says who wants it: "user_asked" starts it now and returns its name and id; "offer" is for a task the user named in their latest message (new work here, or "suggest / split off / make a task or session for X"): called with a title alone, it asks the user "New session" or "Do it here" and WAITS for their answer, so it must be the only call in that message (no update_plan, no other tool); the result then tells you to carry on here, or to send the brief with proposal_id so the session starts; "own_initiative" is for work you propose yourself that the user has not told you to do — something you noticed, or the follow-up your own answer or work turned up (when your reply calls work a follow-up or a separate PR, propose it here rather than only saying so, unless it acts on what this session just found and so stays here), never what "Starting other sessions" keeps here or gives to a subagent; the user sees a card and nothing runs until they start it, by pressing Start on it or by telling you (then call this again with just proposal_id).
"user_asked" and "own_initiative" both need a \`prompt\` — the brief: the task, the files or area, what done looks like — and the call is refused without it; \`background\` does not stand in for it. Only an "offer" is a title alone.
context: "fork" = this whole conversation + your \`prompt\`. "fresh" (default) = your \`prompt\` + \`background\` only, so \`background\` is required too, at least 80 characters.
Checkout here ("fresh" only): use_worktree false = shares this checkout and can edit it (in a worktree session its branch and PR too: never for work that ends in a branch or PR of its own or belongs in another repository); true = its own worktree (the default when this session is in one).
Elsewhere (user_asked only, when the user named the place): \`cwd\` for another folder, or \`target\` "cloud" (+ \`environment\`, "fresh" only).`

const START_SCHEMA = {
  type: 'object',
  properties: {
    initiation: {
      type: 'string',
      enum: ['user_asked', 'own_initiative', 'offer'],
      description:
        '"user_asked": the user asked in words for separate, parallel or background work, or told you to start this piece — it starts now (not for a piece "Starting other sessions" gives to a subagent). "offer": a task the user named in their latest message (new work for this session, or one they asked you to suggest, split off or make a session for) — the user is asked first and the call waits for their answer; send only title with it (the brief follows, with proposal_id, if they choose New session). "own_initiative": work you propose yourself that the user has not told you to do — something you noticed, or the follow-up your own answer or work turned up; it waits as a proposal card until the user starts it; never for a task the user\'s message tells you to do, nor for the one piece of work "Starting other sessions" keeps here, nor for what it gives to a subagent. Required unless proposal_id is set.',
    },
    title: { type: 'string', description: 'Under 60 chars; names the task. Shown on the row or card. Required unless proposal_id is set.' },
    prompt: {
      type: 'string',
      description:
        'The brief: the task, the files or area, what done looks like. Required for "user_asked" and "own_initiative" — the call is refused without it, and `background` does not stand in for it; an "offer" leaves it out and you send it with proposal_id once they choose New session. Here and in `background`, put file paths and code identifiers in backticks.',
    },
    background: {
      type: 'string',
      description: `Required with "fresh", besides \`prompt\`: at least ${BACKGROUND_MIN} characters of overall goal, decisions and constraints so far, how this piece fits — for someone who has not seen this conversation. Ignored for "fork".`,
    },
    context: {
      type: 'string',
      enum: ['fresh', 'fork'],
      description:
        '"fresh" (default) or "fork" — see the tool description. A "fork" from a worktree session gets a fresh worktree cut from your branch tip (commit first; uncommitted edits stay here); from a plain checkout it shares the folder.',
    },
    name: { type: 'string', description: `Optional short handle for the session ([a-z0-9-], ≤${NAME_MAX}), e.g. "cli-cleanup". Linked sessions and plan steps refer to it by this name; derived from the title when omitted.` },
    use_worktree: {
      type: 'boolean',
      description:
        '"fresh" only (rejected with "fork"). false = shares this session\'s checkout and can edit it (in a worktree session: its worktree, branch and PR, so never for work that ends in a branch or PR of its own or belongs in another repository). At another place named by `cwd`, false = that folder as it is. true = its own git worktree. Omitted: the same folder when this session works in a plain folder; otherwise its own worktree; with `cwd`, that folder as it is.',
    },
    branch_name: { type: 'string', description: "A short slug for the new worktree's branch (it gets the prefix claude/ and a suffix). Only with a worktree." },
    source_branch: {
      type: 'string',
      description: "The existing local branch the new worktree is cut from. Default: the repository's default branch, or the folder's current commit if that is unknown. Only for a session that gets its own worktree; not with target \"cloud\".",
    },
    cwd: { type: 'string', description: 'The folder the session works in, when it is not this project: an absolute (or ~/) path on this computer. A "fork" there keeps this conversation.' },
    model: {
      type: 'string',
      description: '"fresh" only, optional: a cheaper model for mechanical or read-only pieces (e.g. sonnet or haiku). Same family or cheaper than yours; anything higher is ignored. Omit to inherit yours.',
    },
    effort: { type: 'string', enum: EFFORTS, description: '"fresh" only, optional: reasoning effort at or below yours. Omit to inherit.' },
    permission_mode: {
      type: 'string',
      enum: MODES,
      description: "Optional, local starts only: the permission mode it starts in, only when the user asked for one. Omitted, it starts in the user's own default mode.",
    },
    target: {
      type: 'string',
      enum: ['local', 'cloud'],
      description: '"fresh" only. "local" (default) = this computer. "cloud" = a cloud session (keeps going when this computer sleeps; it never reports back here). Only when the user asks for the cloud.',
    },
    environment: { type: 'string', description: 'With target "cloud": the id of one of the user\'s cloud environments; omitted = the default one.' },
    proposal_id: {
      type: 'string',
      description:
        'Start a proposal the user told you to start, exactly as proposed: its task_id and nothing else. For an offer the user answered with New session: its task_id with prompt, background and context. To change a proposal, dismiss_task it and start a new session.',
    },
    wake_when_done: {
      type: 'boolean',
      description:
        'Each time this session ends a turn, it sends you its report as a message, which wakes you when you are idle, whether or not this is set. Default false; not with own_initiative; ignored with target "cloud", which never reports back.',
    },
  },
}

const DISMISS_DESCRIPTION = `Withdraw a proposal you made with start_session (initiation "own_initiative" or "offer") that the user has not started.

Call this when it went stale: the work was done here after all (by you or the user), it turned out unnecessary, or you proposed a better-scoped replacement (propose the new one first, then dismiss the old task_id). A card the user answered has already left, "Do it here" included, so it needs no call.`

const DISMISS_SCHEMA = {
  type: 'object',
  properties: {
    task_id: { type: 'string', description: 'The task_id the start_session proposal returned.' },
    reason: { type: 'string', description: 'Optional one-line reason the suggestion is no longer needed, e.g. "fixed in this session" or "superseded by task_ab12cd34".' },
  },
  required: ['task_id'],
}

const HAND_OFF_DESCRIPTION = `Move the task you are in the middle of into its own session (a fork of this conversation plus your remaining plan) so you can answer the user now. Use it when a new user message about something else arrives mid-task — not for small corrections or when the user said to keep the work here. In a worktree the fork gets a fresh worktree, normally cut from your branch tip: commit first (uncommitted edits stay here). Bold title line and one sentence right before the call; after it, stop that task here and answer the new message — no recap.`

const HAND_OFF_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Under 60 chars; names the task being moved.' },
    remaining_plan: { type: 'string', description: 'What is left to do: steps, files, what done looks like.' },
    cwd: {
      type: 'string',
      description: "Optional: the folder the task works in when it is another repository than this session's folder, as an absolute (or ~/) path. The fork works there as the folder is. Omitted: this session's folder (or a fresh worktree, in a worktree session).",
    },
  },
  required: ['title', 'remaining_plan'],
}

const LIST_DESCRIPTION =`List Claude Code sessions. {"linked": true} lists the sessions this one started with start_session (name, id, state, branch or folder) — use it, never a search, to find a session you started. Without it, every running background and interactive session on this computer.`

const LIST_SCHEMA = { type: 'object', properties: { linked: { type: 'boolean', description: 'true: only the sessions this one started.' } } }

const taskIdOf = (toolUseId: string) => `task_${toolUseId.replace(/[^A-Za-z0-9]/g, '').slice(-8).toLowerCase()}`
const randomSuffix = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), byte => byte.toString(16).padStart(2, '0')).join('')

async function git($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  const run = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 30_000 }).catch(() => null)
  return run?.exitCode === 0 ? run.stdout.trim() : null
}

// Whether each queued prompt came from the user, by its text, until its turn starts.
const queued = new Map<string, boolean>()
let isEventTurn = false
let proposedThisTurn = 0
let stopPolling: (() => void) | null = null
// Looks run one at a time, so no two overwrite each other's states.
let serial: Promise<unknown> = Promise.resolve()
const inTurn = <T,>(work: () => Promise<T>): Promise<T> => {
  const run = serial.then(work, work)
  serial = run.catch(() => undefined)
  return run
}
let isTicking = false

async function caller($: EngineInterface): Promise<Caller> {
  const [cwd, sessionId, model] = await Promise.all([$.session.cwd(), $.session.id(), $.session.model()])
  const [gitDir, commonDir] = await Promise.all([git($, cwd, ['rev-parse', '--absolute-git-dir']), git($, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])])
  const linked = (await read($, LINKED)) ?? []
  return {
    cwd,
    sessionId,
    model,
    isWorktree: gitDir !== null && commonDir !== null && gitDir !== commonDir,
    isEventTurn,
    names: linked.map(s => s.name),
    suffix: randomSuffix(),
  }
}

/** Makes the folder a new session works in: the folder itself, or a worktree cut for it. */
async function prepare($: EngineInterface, brief: Brief): Promise<{ cwd: string; branch: string | null } | { error: string }> {
  const { place } = brief
  if (place.kind === 'cloud') return { cwd: await $.session.cwd(), branch: null }
  if (place.kind === 'folder') {
    const home = (await $.env.get('HOME')) ?? ''
    const cwd = place.cwd.replace(/^~(?=\/|$)/, home)
    const stat = await $.fs.stat(cwd, { resolve: true }).catch(() => undefined)
    return stat?.kind === 'dir' ? { cwd: stat.realPath ?? cwd, branch: null } : { error: `${place.cwd} is not a folder on this computer.` }
  }
  const commonDir = await git($, place.root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (commonDir === null) return { error: `${place.root} is not in a git repository, so it cannot get a worktree. Pass use_worktree false.` }
  const repo = commonDir.replace(/\/\.git\/?$/, '')
  let source = place.source
  if (source === null) {
    const remoteHead = await git($, place.root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    const local = remoteHead?.replace(/^origin\//, '') ?? null
    source = local !== null && (await git($, place.root, ['rev-parse', '--verify', '--quiet', `refs/heads/${local}`])) !== null ? local : (remoteHead ?? 'HEAD')
  }
  const path = `${repo}/.claude/worktrees/${place.branch.replace(/^claude\//, '')}`
  const run = await $.process.run(['git', '-C', place.root, 'worktree', 'add', '-b', place.branch, path, source], { timeoutMs: 60_000 })
  if (run.exitCode !== 0) return { error: `git worktree add failed: ${run.stderr.trim()}` }
  return { cwd: path, branch: place.branch }
}

/** Starts the session and links it here, or says why it could not start. */
async function launch($: EngineInterface, brief: Brief, callId: string): Promise<{ text: string } | { error: string }> {
  // The call's row says "starting…" until the session is linked or the start fails.
  const launching = { ...LAUNCHING, id: callId }
  await $.state.set(launching, true)
  try {
    return await launchNow($, brief, callId)
  } finally {
    await $.state.set(launching, false)
  }
}

async function launchNow($: EngineInterface, brief: Brief, callId: string): Promise<{ text: string } | { error: string }> {
  const ready = await prepare($, brief)
  if ('error' in ready) return ready
  const sessionId = await $.session.id()
  const run = await $.process.run(startCommand(brief, sessionId), { cwd: ready.cwd, timeoutMs: 90_000 }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  if (brief.place.kind === 'cloud') {
    if (run.exitCode !== 0) return { error: `The cloud session did not start: ${(run.stderr || run.stdout).trim().slice(0, 500)}` }
    return { text: `Started a cloud session for "${brief.title}". A cloud session never reports back here. What it printed:\n${run.stdout.trim().slice(0, 800)}` }
  }
  const id = backgroundedId(run.stdout)
  if (run.exitCode !== 0 || id === null) return { error: `The session did not start: ${(run.stderr || run.stdout).trim().slice(0, 500) || `exit code ${run.exitCode}`}` }
  // The new session's toolkit reads this to send its reports here; its first turn takes longer than the write.
  const home = (await $.env.get('HOME')) ?? ''
  await $.fs.write(linkPath(home, id), JSON.stringify({ parent: sessionId, name: brief.name }))
  const session: LinkedSession = { name: brief.name, title: brief.title, id, sessionId: null, cwd: ready.cwd, branch: ready.branch, state: 'starting', startedAt: Date.now(), callId }
  await update($, LINKED, was => [...(was ?? []), session])
  watch($)
  const where = ready.branch ? `its own worktree ${ready.cwd} on branch ${ready.branch}` : ready.cwd
  return {
    text: `Started session "${brief.name}" (id ${id}) in ${where}, in ${brief.permissionMode ?? "the user's default"} mode. It is a real session: the user can open it with \`claude attach ${id}\`. Each time it ends a turn, it sends you its report as a message from that session; never poll it. Follow-ups go to it with SendMessage (to "${brief.name}").\nLinked sessions now:\n${linkedLines((await read($, LINKED)) ?? [])}`,
  }
}

// The end of a transcript: $.fs.read refuses files over 4 MiB, and a fork's starts as long as its parent's.
async function transcriptTail($: EngineInterface, path: string): Promise<string> {
  const run = await $.process.run(['tail', '-c', '1000000', path], { timeoutMs: 10_000 }).catch(() => null)
  return run?.exitCode === 0 ? run.stdout : ''
}

const tick = ($: EngineInterface) => inTurn(() => look($))

/**
 * One look at the linked sessions, for their rows. Reports come from the sessions themselves; a
 * session whose process ends gets a toast too, as one that crashed or was stopped sends none.
 */
async function look($: EngineInterface) {
  const linked = (await read($, LINKED)) ?? []
  if (linked.length === 0) return
  const listing = await $.process.run(['claude', 'agents', '--json', '--all'], { timeoutMs: 20_000 }).catch(() => null)
  if (listing === null || listing.exitCode !== 0) return
  const rows = parseAgents(listing.stdout)
  const home = (await $.env.get('HOME')) ?? ''
  const changes = new Map<string, Pick<LinkedSession, 'state' | 'sessionId'>>()
  for (const session of linked) {
    const row = rows.get(session.id)
    let state = row?.state ?? 'gone'
    const sessionId = row?.sessionId ?? session.sessionId
    // Listed as idle a moment before its first turn starts.
    if (state === 'idle' && session.state === 'starting') {
      const jsonl = sessionId === null ? '' : await transcriptTail($, transcriptPath(home, row?.cwd || session.cwd, sessionId))
      if (latestReport(jsonl, session.startedAt) === null) state = 'starting'
    }
    if (isAlive(session.state) && !isAlive(state)) $.ui.toast(`toolkit: session ${session.name} (${session.id}) ${state === 'gone' ? 'was removed' : `ended: ${state}`}`)
    changes.set(session.id, { state, sessionId })
  }
  // Merged by id, so a session started while this look ran is kept.
  const next = await update($, LINKED, was => (was ?? []).map(s => ({ ...s, ...changes.get(s.id) })))
  if (!(next ?? []).some(s => isAlive(s.state))) stopWatching()
}

/** In a session start_session started: its report, sent to the session that started it. */
async function reportBack($: EngineInterface, reason: string, answer: string) {
  const [home, sessionId, cwd] = await Promise.all([$.env.get('HOME').then(home => home ?? ''), $.session.id(), $.session.cwd()])
  const id = shortId(sessionId)
  const path = linkPath(home, id)
  if (!(await $.fs.exists(path))) return
  const link = parseLink(await $.fs.read(path))
  if (link === null) return
  const latest = latestReport(await transcriptTail($, transcriptPath(home, cwd, sessionId)))
  // The transcript adds the recap and the text before a box; one not yet holding this turn's answer is a turn behind.
  const final = answer.trim() === '.' ? '' : answer.trim()
  const report = latest !== null && latest.report.includes(final.slice(0, 40)) ? latest.report : final
  const sent = await $.session.send({ to: { sessionId: link.parent }, text: reportText(link.name, id, reason, report) })
  if (!sent.isDelivered) $.ui.log(`toolkit: the report to the session that started this one was not delivered: ${sent.reason}`, { to: 'debug' })
}

function watch($: EngineInterface) {
  if (stopPolling !== null) return
  const timer = $.clock.every(POLL_MS, () => {
    // A look that outlasts the period is not stacked behind another.
    if (isTicking) return
    isTicking = true
    void tick($)
      .catch(err => $.ui.log(`toolkit: could not read the linked sessions: ${String(err)}`, { to: 'debug' }))
      .finally(() => (isTicking = false))
  })
  stopPolling = () => timer.cancel()
}

function stopWatching() {
  stopPolling?.()
  stopPolling = null
}

/** Starts a proposal the user accepted, from its card or through Claude. */
async function startProposal($: EngineInterface, proposal: Proposal, brief: Brief): Promise<{ text: string } | { error: string }> {
  if (Date.now() - proposal.createdAt > WEEK_MS) return { error: `${proposal.taskId} expired after a week. Propose it again if it is still worth doing.` }
  const ref = { ...PROPOSALS, id: proposal.taskId }
  let isFirst = false
  await update($, ref, was => {
    isFirst = was?.status === 'open' || was?.status === 'new_session'
    return isFirst && was ? { ...was, status: 'started' as const, session: brief.name } : (was ?? null)
  })
  if (!isFirst) return { error: `${proposal.taskId} was already started or withdrawn.` }
  const started = await launch($, brief, proposal.taskId)
  if ('error' in started) await update($, ref, was => (was ? { ...was, status: proposal.status, session: null } : null))
  return started
}

async function accept($: EngineInterface, plan: { taskId: string; prompt: string | null; background: string | null; context: 'fresh' | 'fork' }, input: Record<string, unknown>) {
  const proposal = await read($, { ...PROPOSALS, id: plan.taskId })
  if (!proposal) return { deny: `No proposal ${plan.taskId} in this session.` }
  if (Date.now() - proposal.createdAt > WEEK_MS) return { deny: `${plan.taskId} expired after a week. Propose it again if it is still worth doing.` }
  if (proposal.status === 'started') return { deny: `${plan.taskId} already started as session "${proposal.session}".` }
  if (proposal.status === 'dismissed') return { deny: `${plan.taskId} was withdrawn.` }
  if (proposal.status === 'here') return { deny: `The user chose Do it here for ${plan.taskId}: do it in this session.` }
  if (proposal.initiation === 'offer' && proposal.status === 'open') return { deny: `The user has not answered the card for ${plan.taskId}.` }
  let brief = proposal.brief
  if (proposal.initiation === 'own_initiative') {
    if (plan.prompt !== null || plan.background !== null) return { deny: 'Start a proposal exactly as proposed: proposal_id and nothing else. To change it, dismiss_task it and start a new session.' }
  } else {
    const made = makeBrief(input, proposal.title, plan.context, await caller($), true)
    if ('deny' in made) return made
    brief = made
  }
  if (brief === null) return { deny: `${plan.taskId} has no brief.` }
  const started = await startProposal($, proposal, brief)
  return 'error' in started ? { deny: started.error } : { result: started.text }
}

export const register: Register = on => {
  // Desktop starts its own sessions, and a -p run has no one to answer a card.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    await $.tool.register({ name: 'start_session', description: START_DESCRIPTION, inputSchema: START_SCHEMA, isDeferred: false })
    await $.tool.register({ name: 'dismiss_task', description: DISMISS_DESCRIPTION, inputSchema: DISMISS_SCHEMA, isDeferred: false })
    await $.tool.register({ name: 'list_sessions', description: LIST_DESCRIPTION, inputSchema: LIST_SCHEMA, isDeferred: false })
    await $.tool.register({ name: 'hand_off_to_session', description: HAND_OFF_DESCRIPTION, inputSchema: HAND_OFF_SCHEMA, isDeferred: false })
    // A reload drops the module's timer, so the reloaded module watches again.
    if (((await read($, LINKED)) ?? []).some(s => isAlive(s.state))) watch($)
    return next(e)
  })

  // Where a prompt came from is known when it is queued; its turn starts later, by its text.
  on('prompt.submit', { origin: { kind: 'composer' } }, async ($, e, next) => {
    queued.set(e.text, true)
    return next(e)
  })
  on('prompt.submit', { origin: { kind: 'plugin' } }, async ($, e, next) => {
    queued.set(e.text, e.origin.kind === 'plugin' && e.origin.asUser === true)
    return next(e)
  })
  on('prompt.submit', { origin: { kind: /^(task-notification|scheduled-trigger|peer|peer-send-message|channel|projects-relay)$/ } }, async ($, e, next) => {
    queued.set(e.text, false)
    return next(e)
  })
  // A turn that another session's report or another automated event started may propose sessions but not start them.
  on('turn.start', { text: /[\s\S]*/ }, async ($, e, next) => {
    if (e.agentId === undefined) {
      proposedThisTurn = 0
      isEventTurn = (queued.get(e.text) ?? [...queued].find(([text]) => e.text.includes(text))?.[1]) === false
      queued.clear()
    }
    return next(e)
  })

  // A session start_session started reports each of its turns to the session that started it, a
  // follow-up's too: Claude Code tells a sender of that turn only when it asked with notify_when_idle.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) void reportBack($, e.reason, e.answer).catch(err => $.ui.log(`toolkit: could not send the report: ${String(err)}`, { to: 'debug' }))
    return result
  })

  on('tool.call', { tool: START_TOOL }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const who = await caller($)
    const plan = planStart(input, who)
    if (plan.kind === 'deny') return { deny: plan.deny }
    if (plan.kind === 'accept') return accept($, plan, input)

    const taskId = taskIdOf(e.tool_use_id)
    if (plan.kind === 'start') {
      const started = await launch($, plan.brief, e.tool_use_id)
      return 'error' in started ? { deny: started.error } : { result: started.text }
    }

    if (plan.kind === 'propose') {
      if (proposedThisTurn >= PROPOSALS_PER_TURN) return { deny: `At most ${PROPOSALS_PER_TURN} proposals a turn.` }
      proposedThisTurn++
      await $.state.set({ ...PROPOSALS, id: taskId }, { taskId, title: plan.brief.title, initiation: 'own_initiative', brief: plan.brief, status: 'open', session: null, createdAt: Date.now() })
      return {
        result: `Proposed as task_id "${taskId}": a card the user can start with its Start button. Nothing runs until they start it; if they tell you to, call start_session with just this proposal_id. It expires after a week. If it goes stale, withdraw it with dismiss_task.`,
      }
    }

    await $.state.set({ ...PROPOSALS, id: taskId }, { taskId, title: plan.title, initiation: 'offer', brief: null, status: 'open', session: null, createdAt: Date.now() })
    void $.ui.notify(`New task: ${plan.title}`).catch(() => undefined)
    const answer = await $.ui.ask(`Start "${plan.title}" as a new session, or do it here?`, { options: ['New session', 'Do it here'], header: 'New task' }).catch(() => null)
    const status: Proposal['status'] = answer === 'New session' ? 'new_session' : answer === 'Do it here' ? 'here' : 'dismissed'
    await update($, { ...PROPOSALS, id: taskId }, was => (was ? { ...was, status } : null))
    if (answer === 'New session') {
      return {
        result: `The user chose New session. Call start_session again with proposal_id "${taskId}", prompt, context, and background for "fresh" (and use_worktree, model or effort if needed); the session starts then. Then go on with anything else the user asked here.`,
      }
    }
    if (answer === 'Do it here') return { result: 'The user chose Do it here: do the task in this session now.' }
    if (answer === null) return { result: 'The user closed the card without choosing. Do not start a session; ask in your reply where they want this done.' }
    return { result: `The user answered in their own words: "${answer}". Act on that.` }
  })

  on('tool.call', { tool: HAND_OFF_TOOL }, async ($, e) => {
    const brief = planHandOff(e, await caller($))
    if ('deny' in brief) return { deny: brief.deny }
    const started = await launch($, brief, e.tool_use_id)
    if ('error' in started) return { deny: started.error }
    const shared = brief.place.kind === 'folder' && brief.place.cwd === (await $.session.cwd()) ? ' It works in this folder, with your uncommitted edits: from now on, edit none of the files that task touches.' : ''
    return { result: `${started.text}\nThe task is that session's now: stop it here and answer the user's new message, with no recap.${shared}` }
  })

  on('tool.call', { tool: DISMISS_TOOL }, async ($, e) => {
    const { task_id: taskId } = e as unknown as { task_id?: unknown }
    if (typeof taskId !== 'string') return { deny: 'task_id is required.' }
    let was: Proposal | null = null
    await update($, { ...PROPOSALS, id: taskId }, proposal => {
      was = proposal ?? null
      return proposal && proposal.status === 'open' ? { ...proposal, status: 'dismissed' as const } : (proposal ?? null)
    })
    const proposal = was as Proposal | null
    if (proposal === null) return { deny: `No proposal ${taskId} in this session.` }
    if (proposal.status === 'started') return { result: `${taskId} was already started as session "${proposal.session}", so it was not withdrawn. Its work is that session's: do not do it here unless the user tells you to.` }
    if (proposal.status !== 'open') return { result: `${taskId} had already left (${proposal.status}); nothing to withdraw.` }
    return { result: `Withdrew ${taskId}.` }
  })

  on('tool.call', { tool: LIST_TOOL }, async ($, e) => {
    const { linked } = e as unknown as { linked?: unknown }
    if (linked === true) {
      await tick($)
      return { result: `Linked sessions now:\n${linkedLines((await read($, LINKED)) ?? [])}` }
    }
    const listing = await $.process.run(['claude', 'agents', '--json'], { timeoutMs: 20_000 })
    return { result: listing.exitCode === 0 ? listing.stdout : `claude agents failed: ${listing.stderr.trim()}` }
  })

  // The call's row is the session's row: its state, and how to open or stop it, or the card to start it.
  on('ui.render', { surface: 'terminal', component: 'ToolUse', props: { tool: /^mcp__toolkit__(start_session|hand_off_to_session)$/ } }, async ($, e, next) => {
    if (e.props.isExpanded || e.props.isErrored) return next(e)
    const input = (e.props.input ?? {}) as Record<string, unknown>
    const { Box, Button, Text } = $.ui.resolve(e)
    const proposalId = typeof input.proposal_id === 'string' ? input.proposal_id : null
    const taskId = proposalId ?? taskIdOf(e.props.tool_use_id)
    const proposal = await read($, { ...PROPOSALS, id: taskId })
    const linked = (await read($, LINKED)) ?? []
    // An offer's row keeps the user's answer; the call that sent its brief shows the session.
    const isOfferCard = proposal?.initiation === 'offer' && proposalId === null
    const session = linked.find(s => s.callId === e.props.tool_use_id || (!isOfferCard && s.callId === taskId))
    const title = proposal?.title ?? (typeof input.title === 'string' ? input.title : 'session')

    const link = (key: string, label: string, onPress: () => void, isDim = false) => (
      <Box key={`hover:${key}`}>
        <Button key={key} plain dimColor={isDim} hover={{ underline: true }} label={label} onPress={onPress} />
      </Box>
    )
    let heading = e.props.tool === HAND_OFF_TOOL ? 'Handed off' : 'New session'
    let line: JSX.Element
    if (session) {
      const stop = () => void $.process.run(['claude', 'stop', session.id]).then(() => tick($))
      const copy = () => void $.ui.copy({ text: `claude attach ${session.id}`, surface: e.surface })
      line = (
        <Box flexDirection="row" flexWrap="wrap">
          <Text>{`${session.name} · ${session.state === 'gone' ? 'removed' : session.state}${session.branch ? ` · ${session.branch}` : ''}  `}</Text>
          {link('attach', `claude attach ${session.id}`, copy)}
          {session.state === 'working' ? [<Text dimColor>{'  ·  '}</Text>, link('stop', 'stop', stop, true)] : []}
        </Box>
      )
    } else if (proposal?.initiation === 'own_initiative') {
      heading = 'Suggested session'
      const start = () =>
        void (async () => {
          if (!proposal.brief) return
          const started = await startProposal($, proposal, proposal.brief)
          if ('error' in started) return $.ui.toast(`toolkit: ${started.error}`)
          // Claude learns of it as the user's own word, as on Desktop.
          await $.prompt.submit({ text: `I started the suggested session "${proposal.title}" (${proposal.taskId}).`, asUser: true })
        })()
      const dismiss = () => void update($, { ...PROPOSALS, id: taskId }, was => (was && was.status === 'open' ? { ...was, status: 'dismissed' as const } : (was ?? null)))
      const expired = Date.now() - proposal.createdAt > WEEK_MS
      line =
        proposal.status === 'open' && !expired ? (
          <Box flexDirection="row" flexWrap="wrap">
            {link('start', 'Start', start)}
            <Text dimColor>{'  ·  '}</Text>
            {link('dismiss', 'Dismiss', dismiss, true)}
          </Box>
        ) : (
          <Text dimColor>{expired && proposal.status === 'open' ? 'Expired' : proposal.status === 'dismissed' ? 'Dismissed' : proposal.status === 'started' ? `Started as ${proposal.session}` : proposal.status}</Text>
        )
    } else if (proposal?.initiation === 'offer') {
      heading = 'New task'
      const said = { open: 'New session or do it here?', new_session: 'You chose: New session', here: 'You chose: Do it here', started: `Started as ${proposal.session}`, dismissed: 'Closed' }
      line = <Text dimColor>{said[proposal.status]}</Text>
    } else if (await read($, { ...LAUNCHING, id: e.props.tool_use_id })) {
      line = <Text dimColor>starting…</Text>
    } else {
      if (e.props.isRunning) return next(e)
      line = <Text dimColor>{typeof input.target === 'string' && input.target === 'cloud' ? 'cloud session' : 'not linked here'}</Text>
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Box width={2} minWidth={2}>
            <Text>●</Text>
          </Box>
          <Text>
            <Text weight="semibold">{heading}</Text> {title}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Box width={5} minWidth={5}>
            <Text dimColor>{'  ⎿  '}</Text>
          </Box>
          <Box flexGrow={1}>{line}</Box>
        </Box>
      </Box>
    )
  })

  // The row above says it all; an error keeps the engine's drawing, so its reason shows.
  for (const tool of [START_TOOL, HAND_OFF_TOOL, DISMISS_TOOL]) {
    on('ui.render', { surface: 'terminal', component: 'ToolResult', props: { tool } }, async ($, e, next) => {
      if (e.props.isExpanded || e.props.isErrored) return next(e)
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
  }
}
