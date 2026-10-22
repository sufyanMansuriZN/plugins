import { expect, test } from 'claude-code/testing'

import { backgroundedId, eventText, latestReport, lowerMode, parseAgents, planStart, sessionName, startCommand } from './sessions-model'
import type { Caller } from './sessions-model'

const caller = (over: Partial<Caller> = {}): Caller => ({
  cwd: '/repo',
  sessionId: 'parent-uuid',
  model: 'claude-opus-5-5',
  mode: 'acceptEdits',
  isWorktree: false,
  isEventTurn: false,
  names: [],
  suffix: 'a1b2c3',
  ...over,
})
const BACKGROUND = 'The parser drops blank lines between list items; we agreed to keep the old public API and fix it in place.'
const asked = { initiation: 'user_asked', title: 'Fix blank lines', prompt: 'Fix `parse()` in `src/parse.ts`; done when its tests pass.', background: BACKGROUND }

test('a user_asked start inherits this session\'s mode and works in this folder', () => {
  const plan = planStart(asked, caller())
  expect(plan.kind).toBe('start')
  if (plan.kind !== 'start') return
  expect(plan.brief.permissionMode).toBe('acceptEdits')
  expect(plan.brief.place).toEqual({ kind: 'folder', cwd: '/repo' })
  expect(plan.brief.name).toBe('fix-blank-lines')
  expect(plan.brief.text).toBe(`${BACKGROUND}\n\n## Your task\n${asked.prompt}`)
})

test('a mode above this session\'s is refused, and an unknown session mode reads as default', () => {
  expect(planStart({ ...asked, permission_mode: 'auto' }, caller()).kind).toBe('deny')
  expect(planStart({ ...asked, permission_mode: 'bypassPermissions' }, caller({ mode: 'default' })).kind).toBe('deny')
  const lower = planStart({ ...asked, permission_mode: 'plan' }, caller())
  expect(lower.kind === 'start' && lower.brief.permissionMode).toBe('plan')
})

test('plan is the lowest mode, so a plan session cannot start one that edits', () => {
  expect(planStart({ ...asked, permission_mode: 'default' }, caller({ mode: 'plan' })).kind).toBe('deny')
  const inherited = planStart(asked, caller({ mode: 'plan' }))
  expect(inherited.kind === 'start' && inherited.brief.permissionMode).toBe('plan')
  expect(lowerMode('auto', 'default')).toBe('default')
  expect(lowerMode('plan', 'acceptEdits')).toBe('plan')
})

test('a fresh start needs a brief and enough background', () => {
  expect(planStart({ ...asked, prompt: undefined }, caller()).kind).toBe('deny')
  expect(planStart({ ...asked, background: 'too short' }, caller()).kind).toBe('deny')
  expect(planStart({ ...asked, background: undefined, context: 'fork' }, caller()).kind).toBe('start')
})

test('an offer is a title alone, and a proposal needs the full brief', () => {
  expect(planStart({ initiation: 'offer', title: 'Clean up the CLI' }, caller())).toEqual({ kind: 'offer', title: 'Clean up the CLI' })
  expect(planStart({ initiation: 'own_initiative', title: 'Clean up' }, caller()).kind).toBe('deny')
  expect(planStart({ ...asked, initiation: 'own_initiative' }, caller()).kind).toBe('propose')
  expect(planStart({ ...asked, initiation: 'own_initiative', wake_when_done: true }, caller()).kind).toBe('deny')
})

test('a turn an event started may propose but not start', () => {
  expect(planStart(asked, caller({ isEventTurn: true })).kind).toBe('deny')
  expect(planStart({ proposal_id: 'task_abc' }, caller({ isEventTurn: true })).kind).toBe('deny')
  expect(planStart({ proposal_id: 'task_abc' }, caller()).kind).toBe('accept')
  expect(planStart({ ...asked, initiation: 'own_initiative' }, caller({ isEventTurn: true })).kind).toBe('propose')
})

test('a worktree session gives a fresh start its own worktree, and a fork one cut from its tip', () => {
  const fresh = planStart(asked, caller({ isWorktree: true }))
  expect(fresh.kind === 'start' && fresh.brief.place).toEqual({ kind: 'worktree', root: '/repo', branch: 'claude/fix-blank-lines-a1b2c3', source: null })
  const fork = planStart({ ...asked, context: 'fork' }, caller({ isWorktree: true }))
  expect(fork.kind === 'start' && fork.brief.place).toEqual({ kind: 'worktree', root: '/repo', branch: 'claude/fix-blank-lines-a1b2c3', source: 'HEAD' })
  const shared = planStart({ ...asked, use_worktree: false }, caller({ isWorktree: true }))
  expect(shared.kind === 'start' && shared.brief.place).toEqual({ kind: 'folder', cwd: '/repo' })
  expect(planStart({ ...asked, context: 'fork', use_worktree: true }, caller()).kind).toBe('deny')
})

test('places this terminal does not have are refused with the reason', () => {
  const ssh = planStart({ ...asked, target: 'ssh', host: 'devbox' }, caller())
  expect(ssh.kind === 'deny' && ssh.deny).toContain('SSH')
  expect(planStart({ ...asked, preset: 'usual' }, caller()).kind).toBe('deny')
  expect(planStart({ ...asked, target: 'cloud', source_branch: 'main' }, caller()).kind).toBe('deny')
  const cloud = planStart({ ...asked, target: 'cloud' }, caller())
  expect(cloud.kind === 'start' && cloud.brief.place).toEqual({ kind: 'cloud', environment: null })
  expect(planStart({ ...asked, initiation: 'own_initiative', cwd: '/other' }, caller()).kind).toBe('deny')
  const other = planStart({ ...asked, cwd: '/other' }, caller({ isWorktree: true }))
  expect(other.kind === 'start' && other.brief.place).toEqual({ kind: 'folder', cwd: '/other' })
})

test('a model above this session\'s family is ignored, a cheaper one kept', () => {
  const higher = planStart({ ...asked, model: 'fable' }, caller())
  expect(higher.kind === 'start' && higher.brief.model).toBe(null)
  const cheaper = planStart({ ...asked, model: 'haiku', effort: 'low' }, caller())
  expect(cheaper.kind === 'start' && [cheaper.brief.model, cheaper.brief.effort]).toEqual(['haiku', 'low'])
})

test('names stay unique handles', () => {
  expect(sessionName('Fix: the CLI!', [])).toBe('fix-the-cli')
  expect(sessionName('fix', ['fix', 'fix-2'])).toBe('fix-3')
  expect(sessionName('a'.repeat(40), []).length).toBe(24)
  expect(sessionName('List TODO comments in plugins/session-bar', [])).toBe('list-todo-comments-in')
})

test('the start command passes the mode and the brief after --', () => {
  const plan = planStart({ ...asked, context: 'fork', prompt: '-starts with a dash' }, caller())
  if (plan.kind !== 'start') throw new Error(plan.kind)
  expect(startCommand(plan.brief, 'parent-uuid')).toEqual(['claude', '--bg', '-n', 'fix-blank-lines', '--permission-mode', 'acceptEdits', '--resume', 'parent-uuid', '--fork-session', '--', '-starts with a dash'])
})

test('the background id and agent states are read from the CLI output', () => {
  expect(backgroundedId('Starting background service…\nbackgrounded · 9b7e23c4 · fork-probe\n')).toBe('9b7e23c4')
  expect(backgroundedId('Workspace not trusted.')).toBe(null)
  const rows = parseAgents(
    JSON.stringify([
      { id: 'aaaa1111', sessionId: 'uuid-1', cwd: '/repo', state: 'working', status: 'busy' },
      { id: 'bbbb2222', sessionId: 'uuid-2', cwd: '/repo', state: 'working', status: 'idle' },
      { id: 'cccc3333', sessionId: 'uuid-3', cwd: '/repo', state: 'stopped' },
      { sessionId: 'no-id' },
    ]),
  )
  expect([...rows.values()].map(r => [r.id, r.state])).toEqual([
    ['aaaa1111', 'working'],
    ['bbbb2222', 'idle'],
    ['cccc3333', 'stopped'],
  ])
  expect(parseAgents('not json').size).toBe(0)
})

const row = (value: object) => JSON.stringify(value)
test('the report is the last turn\'s wrap_up recap, then its final message', () => {
  const jsonl = [
    row({ type: 'user', uuid: 'u1', message: { content: 'first task' } }),
    row({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'old answer' }] } }),
    row({ type: 'user', uuid: 'u2', message: { content: 'second task' } }),
    row({ type: 'assistant', uuid: 'a2', message: { content: [{ type: 'text', text: 'Fixed the parser.' }] } }),
    row({ type: 'assistant', uuid: 'a3', message: { content: [{ type: 'tool_use', name: 'mcp__toolkit__wrap_up', input: { recap: 'Parser fixed; tests pass.' } }] } }),
    row({ type: 'user', uuid: 'r3', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
    row({ type: 'assistant', uuid: 'a4', message: { content: [{ type: 'text', text: '.' }] } }),
  ].join('\n')
  expect(latestReport(jsonl)).toEqual({ uuid: 'a4', report: 'Parser fixed; tests pass.\n\nFixed the parser.' })
  expect(latestReport(`{"cut off line\n${jsonl}`)?.uuid).toBe('a4')
  expect(latestReport(row({ type: 'user', uuid: 'u1', message: { content: 'just started' } }))).toBe(null)
  expect(latestReport(row({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'x'.repeat(500) }] } }))?.report.length).toBe(401)
})

test('a fork reports nothing until it answers, though its transcript opens with the parent\'s turns', () => {
  const startedAt = Date.parse('2026-10-22T13:16:28Z')
  const copied = [
    row({ type: 'user', uuid: 'p1', timestamp: '2026-10-22T13:16:21Z', message: { content: 'Remember PELICAN.' } }),
    row({ type: 'assistant', uuid: 'p2', timestamp: '2026-10-22T13:16:23Z', message: { content: [{ type: 'text', text: 'noted' }] } }),
  ]
  expect(latestReport(copied.join('\n'), startedAt)).toBe(null)
  const answered = [
    ...copied,
    row({ type: 'user', uuid: 'f1', timestamp: '2026-10-22T13:16:29Z', message: { content: 'Reply with the code word.' } }),
    row({ type: 'assistant', uuid: 'f2', timestamp: '2026-10-22T13:16:31Z', message: { content: [{ type: 'text', text: 'PELICAN' }] } }),
  ]
  expect(latestReport(answered.join('\n'), startedAt)).toEqual({ uuid: 'f2', report: 'PELICAN' })
})

test('the event names each report and the linked sessions', () => {
  const text = eventText([{ name: 'fix', id: 'abc123', state: 'done', branch: 'claude/fix-a1', report: 'Done.' }], [
    { name: 'fix', title: 'Fix', id: 'abc123', sessionId: 'uuid', cwd: '/repo', branch: 'claude/fix-a1', state: 'done', reported: 'a4', startedAt: 0, callId: 't' },
  ])
  expect(text.startsWith('<side-sessions-event>')).toBe(true)
  expect(text).toContain('<session name="fix" id="abc123" state="done" branch="refs/heads/claude/fix-a1">\nDone.\n</session>')
  expect(text).toContain('- fix (id abc123, session uuid): done; "Fix"; branch refs/heads/claude/fix-a1')
})
