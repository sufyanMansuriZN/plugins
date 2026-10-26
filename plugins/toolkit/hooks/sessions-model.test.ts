import { expect, test } from 'claude-code/testing'

import { backgroundedId, cardAnchor, latestReport, linkPath, parseAgents, parseLink, planHandOff, planStart, reportText, sessionName, shortId, startCommand } from './sessions-model'
import type { Caller } from './sessions-model'

const caller = (over: Partial<Caller> = {}): Caller => ({
  cwd: '/repo',
  sessionId: 'parent-uuid',
  model: 'claude-opus-5-5',
  isWorktree: false,
  isEventTurn: false,
  names: [],
  suffix: 'a1b2c3',
  ...over,
})
const BACKGROUND = 'The parser drops blank lines between list items; we agreed to keep the old public API and fix it in place.'
const asked = { initiation: 'user_asked', title: 'Fix blank lines', prompt: 'Fix `parse()` in `src/parse.ts`; done when its tests pass.', background: BACKGROUND }

test('a user_asked start takes the user\'s default mode and works in this folder', () => {
  const plan = planStart(asked, caller())
  expect(plan.kind).toBe('start')
  if (plan.kind !== 'start') return
  expect(plan.brief.permissionMode).toBe(null)
  expect(plan.brief.place).toEqual({ kind: 'folder', cwd: '/repo' })
  expect(plan.brief.name).toBe('fix-blank-lines')
  expect(plan.brief.text).toBe(`${BACKGROUND}\n\n## Your task\n${asked.prompt}`)
  expect(startCommand(plan.brief, 'parent-uuid')).not.toContain('--permission-mode')
})

test('any mode Claude asks for is passed on, and an unknown one refused', () => {
  const auto = planStart({ ...asked, permission_mode: 'bypassPermissions' }, caller())
  expect(auto.kind === 'start' && auto.brief.permissionMode).toBe('bypassPermissions')
  expect(planStart({ ...asked, permission_mode: 'yolo' }, caller()).kind).toBe('deny')
  expect(planStart({ ...asked, target: 'cloud', permission_mode: 'plan' }, caller()).kind).toBe('deny')
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

test('a hand-off forks this conversation with the remaining plan, and the fork leaves the new message alone', () => {
  const handed = planHandOff({ title: 'Fix blank lines', remaining_plan: 'Run the parser tests; done when they pass.' }, caller({ names: ['fix-blank-lines'] }))
  if ('deny' in handed) throw new Error(handed.deny)
  expect([handed.context, handed.name, handed.place, handed.permissionMode, handed.model]).toEqual(['fork', 'fix-blank-lines-2', { kind: 'folder', cwd: '/repo' }, null, null])
  expect(handed.text).toContain('do not act on it')
  expect(handed.text.endsWith('## What is left\nRun the parser tests; done when they pass.')).toBe(true)
  expect(startCommand(handed, 'parent-uuid')).toContain('--fork-session')
  const inWorktree = planHandOff({ title: 'Fix', remaining_plan: 'Finish it.' }, caller({ isWorktree: true }))
  expect('place' in inWorktree && inWorktree.place).toEqual({ kind: 'worktree', root: '/repo', branch: 'claude/fix-a1b2c3', source: 'HEAD' })
})

test('a hand-off into another repository forks there, in that folder as it is', () => {
  const other = planHandOff({ title: 'Fix', remaining_plan: 'Finish it.', cwd: '/other-repo' }, caller({ isWorktree: true }))
  expect('place' in other && other.place).toEqual({ kind: 'folder', cwd: '/other-repo' })
  if ('deny' in other) return
  expect(startCommand(other, 'parent-uuid')).toEqual(expect.arrayContaining(['--resume', 'parent-uuid', '--fork-session']))
})

test('a session that shares a folder turns the background guard off for itself only', () => {
  const shared = planStart(asked, caller())
  if (shared.kind !== 'start') throw new Error(shared.kind)
  const argv = startCommand(shared.brief, 'parent-uuid')
  expect(argv[argv.indexOf('--settings') + 1]).toBe('{"worktree":{"bgIsolation":"none"}}')
  const own = planStart(asked, caller({ isWorktree: true }))
  expect(own.kind === 'start' && startCommand(own.brief, 'parent-uuid')).not.toContain('--settings')
})

test('a hand-off needs a title and a plan, and a turn an event started cannot hand off', () => {
  expect('deny' in planHandOff({ remaining_plan: 'Finish it.' }, caller())).toBe(true)
  expect('deny' in planHandOff({ title: 'Fix', remaining_plan: ' ' }, caller())).toBe(true)
  expect('deny' in planHandOff({ title: 'x'.repeat(41), remaining_plan: 'Finish it.' }, caller())).toBe(true)
  expect('deny' in planHandOff({ title: 'Fix', remaining_plan: 'Finish it.' }, caller({ isEventTurn: true }))).toBe(true)
})

test('an explicit session name must be a handle of up to 24 characters', () => {
  const named = (name: string) => planStart({ ...asked, name }, caller())
  expect(named('cli-cleanup')).toMatchObject({ kind: 'start', brief: { name: 'cli-cleanup' } })
  expect(named('Cli Cleanup')).toMatchObject({ kind: 'deny' })
  expect(named('x'.repeat(25))).toMatchObject({ kind: 'deny' })
})

test('names stay unique handles', () => {
  expect(sessionName('Fix: the CLI!', [])).toBe('fix-the-cli')
  expect(sessionName('fix', ['fix', 'fix-2'])).toBe('fix-3')
  expect(sessionName('a'.repeat(40), []).length).toBe(24)
  expect(sessionName('List TODO comments in plugins/session-bar', [])).toBe('list-todo-comments-in')
})

test('the start command passes the mode and the brief after --', () => {
  const plan = planStart({ ...asked, context: 'fork', prompt: '-starts with a dash', permission_mode: 'acceptEdits' }, caller())
  if (plan.kind !== 'start') throw new Error(plan.kind)
  expect(startCommand(plan.brief, 'parent-uuid')).toEqual(['claude', '--bg', '-n', 'fix-blank-lines', '--settings', '{"worktree":{"bgIsolation":"none"}}', '--permission-mode', 'acceptEdits', '--resume', 'parent-uuid', '--fork-session', '--', '-starts with a dash'])
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

test('a started session finds the session that started it by its short id', () => {
  expect(shortId('ce30fbe1-9987-4a7a-ac71-6c7c89f2d79e')).toBe('ce30fbe1')
  expect(linkPath('/home/me', 'ce30fbe1')).toBe('/home/me/.claude/toolkit/links/ce30fbe1.json')
  expect(parseLink(JSON.stringify({ parent: 'parent-uuid', name: 'fix' }))).toEqual({ parent: 'parent-uuid', name: 'fix' })
  expect(parseLink('{"name":"fix"}')).toBe(null)
  expect(parseLink('not json')).toBe(null)
})

test('the report names the session and how its turn ended', () => {
  const text = reportText('fix', 'abc12345', 'answer', 'Done.')
  expect(text).toContain('Session "fix" (id abc12345), which you started, ended a turn.')
  expect(text).toContain('not proof')
  expect(text.endsWith('\n\nDone.')).toBe(true)
  expect(reportText('fix', 'abc12345', 'aborted', '')).toContain('was stopped in the middle of a turn')
  expect(reportText('fix', 'abc12345', 'error', '').endsWith('(no report)')).toBe(true)
})

test('a turn\'s cards go under its last reply text, once the transcript holds the turn\'s final text', () => {
  const since = Date.parse('2026-10-26T10:59:00Z')
  const at = (s: number) => `2026-10-26T10:59:${String(s).padStart(2, '0')}Z`
  const propose = (id: string, initiation: string) => ({ type: 'tool_use', id, name: 'mcp__toolkit__start_session', input: { initiation, title: 'Check it' } })
  const earlier = row({ type: 'assistant', uuid: 'old', timestamp: '2026-10-26T10:58:00Z', message: { content: [{ type: 'text', text: 'An earlier turn.' }] } })
  const turn = [
    earlier,
    row({ type: 'user', uuid: 'u1', timestamp: at(1), message: { content: 'Check it yourself.' } }),
    row({ type: 'assistant', uuid: 'a1', timestamp: at(2), message: { content: [{ type: 'text', text: 'Checking the shape.' }] } }),
    row({ type: 'assistant', uuid: 'a2', timestamp: at(3), message: { content: [propose('toolu_A', 'own_initiative')] } }),
    row({ type: 'assistant', uuid: 'a3', timestamp: at(4), message: { content: [propose('toolu_B', 'user_asked')] } }),
    row({ type: 'assistant', uuid: 'a4', timestamp: at(5), message: { content: [{ type: 'text', text: 'Yes for the Batch IDs.' }] } }),
  ]
  expect(cardAnchor(turn.join('\n'), since, 'Yes for the Batch IDs.')).toEqual({ uuid: 'a4', toolUseIds: ['toolu_A'] })
  // The final text not written yet: read again later.
  expect(cardAnchor(turn.slice(0, 4).join('\n'), since, 'Yes for the Batch IDs.')).toBe('behind')
  // After a next step box the final text is the hidden period; the card goes under the text before it.
  const boxed = [...turn, row({ type: 'assistant', uuid: 'a5', timestamp: at(6), message: { content: [{ type: 'text', text: '.' }] } })]
  expect(cardAnchor(boxed.join('\n'), since, '.')).toEqual({ uuid: 'a4', toolUseIds: ['toolu_A'] })
  // Earlier text holds a period too, but only the period row itself says the transcript has caught up.
  expect(cardAnchor(turn.slice(0, 4).join('\n'), since, '.')).toBe('behind')
  // A short final text that an earlier row holds too, not yet written after a later row.
  expect(cardAnchor(turn.join('\n'), since, 'Checking')).toBe('behind')
  // An interrupted or thinking-only turn has no final text: no waiting, the rows as they are.
  expect(cardAnchor(turn.join('\n'), since, '')).toEqual({ uuid: 'a4', toolUseIds: ['toolu_A'] })
  expect(cardAnchor(turn.slice(0, 2).join('\n'), since, '')).toBe(null)
  // No proposal this turn, though an earlier turn's text is there.
  expect(cardAnchor([earlier, turn[2]].join('\n'), since, 'Checking the shape.')).toBe(null)
})
