import type { Brief, PermissionMode } from '../types'

export const NAME_MAX = 24
const NAME_PATTERN = new RegExp(`^[a-z0-9-]{1,${NAME_MAX}}$`)

export const MODES: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions']
const isMode = (value: unknown): value is PermissionMode => MODES.includes(value as PermissionMode)

/** What the session making the call knows about itself. */
export type Caller = {
  cwd: string
  /** True when the session works in a linked git worktree. */
  isWorktree: boolean
  /** True on a turn another session's message or another automated event started. */
  isEventTurn: boolean
  /** The names of the sessions it already started. */
  names: string[]
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/** `name`, or `name-2`, `name-3`… when a session started here already has it. */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name
  for (let n = 2; ; n++) {
    const next = `${name.slice(0, NAME_MAX - String(n).length - 1)}-${n}`
    if (!taken.includes(next)) return next
  }
}

/** Checks a start_session call: the brief it starts, or why not. */
export function planStart(input: unknown, caller: Caller): Brief | { deny: string } {
  const e = (input ?? {}) as Record<string, unknown>
  if (caller.isEventTurn) return { deny: "This turn was started by another session's message or an automated event, so no session starts in it. Offer the start to the user in the next step box instead." }
  const context = e.context ?? 'fresh'
  if (context !== 'fresh' && context !== 'fork') return { deny: 'context must be "fresh" or "fork".' }
  const prompt = text(e.prompt)
  if (prompt === null) return { deny: 'prompt is required: the task, the files or area, and what done looks like.' }
  const name = text(e.name)
  if (name === null || !NAME_PATTERN.test(name)) return { deny: `name is required: up to ${NAME_MAX} characters, only a-z, 0-9 and hyphens.` }
  if (e.permission_mode !== undefined && !isMode(e.permission_mode)) return { deny: `permission_mode must be one of ${MODES.join(', ')}.` }
  // A fork carries this branch's work in its conversation, so it stays on this branch.
  if (e.use_worktree === true && context === 'fork') return { deny: 'use_worktree goes with "fresh" only: a fork works in this folder.' }

  const cwd = text(e.cwd)
  const isWorktree = typeof e.use_worktree === 'boolean' ? e.use_worktree : context === 'fresh' && cwd === null && caller.isWorktree
  return {
    name: uniqueName(name, caller.names),
    context,
    text: prompt,
    cwd: cwd ?? caller.cwd,
    isWorktree,
    model: text(e.model),
    permissionMode: isMode(e.permission_mode) ? e.permission_mode : null,
  }
}

/** Turns off, for this one session, the guard that keeps a background session's edits out of a shared checkout. */
export const SHARED_FOLDER_SETTINGS = JSON.stringify({ worktree: { bgIsolation: 'none' } })

/** The command that starts the session, run in `brief.cwd`. */
export function startCommand(brief: Brief, parentSessionId: string): string[] {
  const argv = ['claude', '--bg', '-n', brief.name]
  // Claude Code's guard refuses a background session's edits in a checkout it shares.
  argv.push(...(brief.isWorktree ? ['-w', brief.name] : ['--settings', SHARED_FOLDER_SETTINGS]))
  if (brief.permissionMode) argv.push('--permission-mode', brief.permissionMode)
  if (brief.model) argv.push('--model', brief.model)
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
