import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HAND_OFF = 'mcp__toolkit__hand_off_to_session'

// Beneath the plugin: the engine's rows, the tools registered, and a session outside any git repository.
function engine(on: On): { registered: string[] } {
  const host = { registered: [] as string[] }
  mock.env(on, { HOME: '/home/me' })
  on('session.cwd', () => ({ value: '/w' }))
  on('session.id', () => ({ value: 'parent-uuid' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine: ${e.component}`}</Text>
  })
  on('tool.register', (_$, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  return host
}

async function rowWords($: Engine, tool: string, input: unknown): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: 'toolkit',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: tool,
    props: { tool_use_id: tool, tool, input, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok' },
  })
  const all = await ui.findAll({})
  return all.flatMap(found => (found.type === 'Text' && !['', '●', '⎿'].includes(found.text.trim()) ? [found.text.trim()] : []))
}

test('hand_off_to_session is offered in an interactive terminal session', async ($, on) => {
  const host = engine(on)
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(host.registered).toContain('hand_off_to_session')
})

test('a hand-off without a plan is refused with the reason', async ($, on) => {
  engine(on)
  const call = await $.tool.call({ tool: HAND_OFF, title: 'Fix blank lines' })
  expect(call.deny).toContain('remaining_plan is required')
})

test('a hand-off call draws as a session row headed Handed off', async ($, on) => {
  engine(on)
  const words = await rowWords($, HAND_OFF, { title: 'Fix blank lines', remaining_plan: 'Run the tests.' })
  expect(words).toContain('Handed off')
  expect(words.some(w => w.includes('Fix blank lines'))).toBe(true)
  const start = await rowWords($, 'mcp__toolkit__start_session', { initiation: 'user_asked', title: 'Clean up' })
  expect(start).toContain('New session')
})
