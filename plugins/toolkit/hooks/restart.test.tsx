import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__toolkit__restart_claude_code'
const FILE = '/run/user/1/claude-restart.42'
const RC = '/home/me/.bashrc'

type Agent = { id: string; type: string; description: string; status: 'running' | 'completed' }
type Host = { registered: string[]; runs: string[][]; files: Map<string, string>; agents: Agent[] }

// Beneath the plugin: a disk of `files`, the session's id, model and agents, and the processes it runs.
function engine(on: On, files: Record<string, string> = {}): Host {
  const host: Host = { registered: [], runs: [], files: new Map(Object.entries(files)), agents: [] }
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: host.agents }))
  on('tool.register', (_$, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  on('fs.exists', (_$, e) => ({ value: host.files.has(e.path) }))
  on('fs.read', (_$, e) => ({ value: host.files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    host.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'abc-123' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', (_$, e) => {
    host.runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return host
}

const KILL = ['sh', '-c', 'kill -TERM "$PPID"']
const endTurn = ($: Engine) => $.turn.complete({ reason: 'answer', answer: 'Restarting.', durationMs: 1, isAborted: false, turnId: 't1' })

async function start($: Engine, on: On, env: Record<string, string>, isInteractive = true) {
  mock.env(on, { HOME: '/home/me', ...env })
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: isInteractive ? 'terminal' : null, isInteractive })
}

async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(1)
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

test('session start registers the restart_claude_code tool in a terminal only', async ($, on) => {
  const host = engine(on)
  await start($, on, {})
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
  expect(host.registered.filter(name => name === 'restart_claude_code')).toEqual(['restart_claude_code'])
})

test('under the shell function a call writes the resume arguments and stops Claude Code once, when the turn ends', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on, { CLAUDE_RESTART_FILE: FILE })
  const call = await $.tool.call({ tool: TOOL, prompt: ' carry\non ' })
  expect(call.deny).toBeUndefined()
  await settle(clock)
  expect(host.runs).toEqual([])
  expect(host.files.get(FILE)?.split('\n')).toEqual(['--resume', 'abc-123', '--model', 'claude-opus-5-5', 'carry on'])
  await endTurn($)
  await settle(clock)
  await endTurn($)
  await settle(clock)
  expect(host.runs).toEqual([KILL])
})

test('a call without a prompt resumes with no first prompt', async ($, on) => {
  const host = engine(on)
  await start($, on, { CLAUDE_RESTART_FILE: FILE })
  expect((await $.tool.call({ tool: TOOL })).deny).toBeUndefined()
  expect(host.files.get(FILE)?.split('\n')).toEqual(['--resume', 'abc-123', '--model', 'claude-opus-5-5'])
})

test('without the shell function a call adds it to .bashrc once, keeps what was there, and exits nothing', async ($, on) => {
  const host = engine(on, { [RC]: 'alias ll="ls -l"' })
  const clock = mock.clock(on)
  await start($, on, {})
  const first = await $.tool.call({ tool: TOOL, prompt: 'continue' })
  const second = await $.tool.call({ tool: TOOL, prompt: 'continue' })
  await endTurn($)
  await settle(clock)
  expect(first.deny).toContain('source ~/.bashrc')
  expect(second.deny).toContain('has not loaded it')
  expect(host.runs).toEqual([])
  const rc = host.files.get(RC) ?? ''
  expect(rc.startsWith('alias ll="ls -l"\n')).toBe(true)
  expect(rc.split('# >>> toolkit restart >>>').length).toBe(2)
  expect(rc).toContain('CLAUDE_RESTART_FILE="$f" command claude "${args[@]}"')
})

test('a block from an older toolkit is replaced and what is around it stays', async ($, on) => {
  const old = '# >>> toolkit restart >>>\nclaude() { :; }\n# <<< toolkit restart <<<'
  const host = engine(on, { [RC]: `export A=1\n${old}\nexport B=2\n` })
  await start($, on, { CLAUDE_RESTART_FILE: FILE })
  await $.tool.call({ tool: TOOL, prompt: 'continue' })
  const rc = host.files.get(RC) ?? ''
  expect(rc.startsWith('export A=1\n# >>> toolkit restart >>>\n')).toBe(true)
  expect(rc.endsWith('# <<< toolkit restart <<<\nexport B=2\n')).toBe(true)
  expect(rc).not.toContain('claude() { :; }')
})

test('a running subagent refuses the restart, and a finished one does not', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on, { CLAUDE_RESTART_FILE: FILE })
  host.agents = [
    { id: 'a1', type: 'Explore', description: 'Review the diff', status: 'running' },
    { id: 'a2', type: 'Explore', description: 'Old search', status: 'completed' },
  ]
  const refused = await $.tool.call({ tool: TOOL, prompt: 'continue' })
  await endTurn($)
  await settle(clock)
  expect(refused.deny).toContain('Review the diff')
  expect(refused.deny).not.toContain('Old search')
  expect(host.runs).toEqual([])
  expect(host.files.has(FILE)).toBe(false)
  host.agents[0].status = 'completed'
  expect((await $.tool.call({ tool: TOOL, prompt: 'continue' })).deny).toBeUndefined()
  await endTurn($)
  await settle(clock)
  expect(host.runs).toEqual([KILL])
})
