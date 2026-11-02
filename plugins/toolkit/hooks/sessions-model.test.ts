import { expect, test } from 'claude-code/testing'

import { backgroundedId, planStart, startCommand, uniqueName } from './sessions-model'
import type { Caller } from './sessions-model'

const caller = (over: Partial<Caller> = {}): Caller => ({ cwd: '/repo', isWorktree: false, isEventTurn: false, names: [], ...over })
const asked = { name: 'fix-blank-lines', prompt: 'Fix `parse()` in `src/parse.ts`; done when its tests pass.' }

test('a start takes the user\'s default mode and shares this folder, with the background guard off for it only', () => {
  const brief = planStart(asked, caller())
  expect(brief).toEqual({ name: 'fix-blank-lines', context: 'fresh', text: asked.prompt, cwd: '/repo', isWorktree: false, model: null, permissionMode: null })
  if ('deny' in brief) return
  expect(startCommand(brief, 'parent-uuid')).toEqual(['claude', '--bg', '-n', 'fix-blank-lines', '--settings', '{"worktree":{"bgIsolation":"none"}}', '--', asked.prompt])
})

test('a start needs a prompt and a handle for a name', () => {
  expect('deny' in planStart({ name: 'x' }, caller())).toBe(true)
  expect('deny' in planStart({ prompt: 'Do it.' }, caller())).toBe(true)
  expect('deny' in planStart({ ...asked, name: 'Cli Cleanup' }, caller())).toBe(true)
  expect('deny' in planStart({ ...asked, name: 'x'.repeat(25) }, caller())).toBe(true)
  expect('deny' in planStart({ ...asked, permission_mode: 'yolo' }, caller())).toBe(true)
})

test('a turn an event started starts no session', () => {
  const refused = planStart(asked, caller({ isEventTurn: true }))
  expect('deny' in refused && refused.deny).toContain('next step box')
})

test('a fresh start from a worktree session gets its own worktree from Claude Code, and a fork stays in this folder', () => {
  const fresh = planStart(asked, caller({ isWorktree: true }))
  if ('deny' in fresh) throw new Error(fresh.deny)
  expect(startCommand(fresh, 'parent-uuid')).toEqual(['claude', '--bg', '-n', 'fix-blank-lines', '-w', 'fix-blank-lines', '--', asked.prompt])
  const fork = planStart({ ...asked, context: 'fork' }, caller({ isWorktree: true }))
  expect('isWorktree' in fork && fork.isWorktree).toBe(false)
  expect('deny' in planStart({ ...asked, context: 'fork', use_worktree: true }, caller())).toBe(true)
  const shared = planStart({ ...asked, use_worktree: false }, caller({ isWorktree: true }))
  expect('isWorktree' in shared && shared.isWorktree).toBe(false)
})

test('another folder is used as it is', () => {
  const other = planStart({ ...asked, cwd: '/other' }, caller({ isWorktree: true }))
  expect('cwd' in other && [other.cwd, other.isWorktree]).toEqual(['/other', false])
})

test('the start command passes the mode, the model and the fork, then the brief after --', () => {
  const brief = planStart({ ...asked, context: 'fork', prompt: '-starts with a dash', permission_mode: 'acceptEdits', model: 'haiku' }, caller())
  if ('deny' in brief) throw new Error(brief.deny)
  expect(startCommand(brief, 'parent-uuid')).toEqual(['claude', '--bg', '-n', 'fix-blank-lines', '--settings', '{"worktree":{"bgIsolation":"none"}}', '--permission-mode', 'acceptEdits', '--model', 'haiku', '--resume', 'parent-uuid', '--fork-session', '--', '-starts with a dash'])
})

test('names stay unique among the sessions started here', () => {
  expect(uniqueName('fix', [])).toBe('fix')
  expect(uniqueName('fix', ['fix', 'fix-2'])).toBe('fix-3')
  expect(uniqueName('a'.repeat(24), ['a'.repeat(24)])).toBe(`${'a'.repeat(22)}-2`)
  const named = planStart(asked, caller({ names: ['fix-blank-lines'] }))
  expect('name' in named && named.name).toBe('fix-blank-lines-2')
})

test('the background id is read from what claude --bg prints', () => {
  expect(backgroundedId('Starting background service…\nbackgrounded · 9b7e23c4 · fork-probe\n')).toBe('9b7e23c4')
  expect(backgroundedId('Workspace not trusted.')).toBe(null)
})
