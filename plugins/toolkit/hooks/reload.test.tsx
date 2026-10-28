import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__toolkit__reload_plugins'
const REPORT = 'Reloaded: 3 plugins'

type Host = { registered: string[]; commands: { command: string; args: string }[]; prompts: string[]; toasts: string[] }

// Beneath the plugin: the session's commands and prompts. `reload` is what a /reload-plugins does
// before it returns, if anything.
function engine(on: On, reload?: () => Promise<unknown>): Host {
  const host: Host = { registered: [], commands: [], prompts: [], toasts: [] }
  on('ui.toast', (_$, e) => {
    host.toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.register', (_$, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  on('command.run', async (_$, e) => {
    host.commands.push({ command: e.command, args: e.args })
    await reload?.()
    return { text: REPORT }
  })
  on('prompt.submit', (_$, e) => {
    host.prompts.push(e.text)
    return { text: e.text }
  })
  return host
}

async function start($: Engine, on: On, isInteractive = true) {
  mock.env(on, {})
  on('session.start', () => ({ cwd: '/w' }))
  await $.session.start({ cwd: '/w', surface: isInteractive ? 'terminal' : null, isInteractive })
}

async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(1)
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

test('session start registers the reload_plugins tool', async ($, on) => {
  const host = engine(on)
  await start($, on)
  expect(host.registered).toContain('reload_plugins')
})

test('a session with no terminal gets no reload_plugins tool', async ($, on) => {
  const host = engine(on)
  await start($, on, false)
  expect(host.registered).not.toContain('reload_plugins')
})

test('a call runs /reload-plugins --force once the turn lets it, then submits the report and the task', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on)
  const call = await $.tool.call({ tool: TOOL, task: 'Try the new skill.' })
  expect(call.deny).toBeUndefined()
  expect(host.commands).toEqual([])
  await settle(clock)
  expect(host.commands).toEqual([{ command: 'reload-plugins', args: '--force' }])
  expect(host.toasts).toEqual([])
  expect(host.prompts).toEqual([`Plugins reloaded. The reload said: ${REPORT}. Try the new skill.`])
})

test('a reload that reloads toolkit itself submits the task once, from the new start', async ($, on) => {
  const host = engine(on, () => new Promise(() => {}))
  const clock = mock.clock(on)
  await start($, on)
  await $.tool.call({ tool: TOOL, task: 'Try the new skill.' })
  await settle(clock)
  expect(host.prompts).toEqual([])
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await settle(clock)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await settle(clock)
  expect(host.prompts).toEqual(['Plugins reloaded, toolkit with them. Try the new skill.'])
})
