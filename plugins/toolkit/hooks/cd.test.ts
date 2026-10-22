import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__toolkit__change_session_directory'
const ROOT = '/w'
const APP = '/w/app'
const LINK = '/w/link-to-app'

type Host = { registered: string[]; asked: unknown[]; commands: { command: string; args: string }[]; prompts: string[] }

// Beneath the plugin: a disk where LINK leads to APP and `notes.md` is a file, a person who would
// answer any dialog, and the session's commands and prompts. `cd` is what a /cd does before it
// returns, if anything.
function engine(on: On, cd?: () => Promise<unknown>): Host {
  const host: Host = { registered: [], asked: [], commands: [], prompts: [] }
  on('tool.register', (_$, e) => {
    host.registered.push(e.name)
    return { value: { tool: `mcp__toolkit__${e.name}` } }
  })
  on('fs.stat', (_$, e) => {
    if (e.path === LINK) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, realPath: APP } }
    if (e.path === `${ROOT}/notes.md`) return { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false, realPath: `${ROOT}/notes.md` } }
    return { value: { kind: 'other', size: 0, mtimeMs: 0, isLink: false } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    host.asked.push(e.questions)
    return { result: { questions: e.questions, answers: {} } }
  })
  on('command.run', async (_$, e) => {
    host.commands.push({ command: e.command, args: e.args })
    if (e.command === 'cd') await cd?.()
    return {}
  })
  on('classic.CwdChanged', () => ({}))
  on('prompt.submit', (_$, e) => {
    host.prompts.push(e.text)
    return { text: e.text }
  })
  return host
}

async function start($: Engine, on: On, isInteractive = true) {
  mock.env(on, {})
  on('session.start', () => ({ cwd: ROOT }))
  await $.session.start({ cwd: ROOT, surface: isInteractive ? 'terminal' : null, isInteractive })
}

// The move waits on a timer and then runs over several host calls: move the clock, then let them land.
async function settle(clock: { advance: (ms: number) => Promise<void> }) {
  await clock.advance(1)
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

test('session start registers the change_session_directory tool', async ($, on) => {
  const host = engine(on)
  await start($, on)
  expect(host.registered).toEqual(['change_session_directory'])
})

test('a path that is not a directory is denied without asking', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on)
  for (const path of [`${ROOT}/notes.md`, `${ROOT}/missing`, '']) {
    expect((await $.tool.call({ tool: TOOL, path })).deny).toBeDefined()
  }
  await settle(clock)
  expect(host.asked).toEqual([])
  expect(host.commands).toEqual([])
})

test('a move runs /cd on the real path with no dialog, then submits the task', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on)
  const call = await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
  expect(call.deny).toBeUndefined()
  await settle(clock)
  expect(host.asked).toEqual([])
  expect(host.commands).toEqual([{ command: 'cd', args: APP }])
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Run the tests.`])
})

test('a move from a call that left out its task asks the model to carry on', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on)
  await $.tool.call({ tool: TOOL, path: LINK })
  await settle(clock)
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Continue the task you were on.`])
})

test('a move whose /cd never hands back still submits the task once the directory changes', async ($, on) => {
  const host = engine(on, () => new Promise(() => {}))
  const clock = mock.clock(on)
  await start($, on)
  await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
  await settle(clock)
  expect(host.prompts).toEqual([])
  await $.classic.CwdChanged({ old_cwd: ROOT, new_cwd: APP })
  await settle(clock)
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Run the tests.`])
})

test('a move seen both by the directory change and by /cd handing back submits the task once', async ($, on) => {
  const host = engine(on, () => $.classic.CwdChanged({ old_cwd: ROOT, new_cwd: APP }))
  const clock = mock.clock(on)
  await start($, on)
  await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
  await settle(clock)
  await $.classic.CwdChanged({ old_cwd: APP, new_cwd: APP })
  await settle(clock)
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Run the tests.`])
})

test('a move whose /cd reloads the module submits the task when the reloaded module starts', async ($, on) => {
  const host = engine(on, () => new Promise(() => {}))
  const clock = mock.clock(on)
  await start($, on)
  await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
  await settle(clock)
  await $.session.start({ cwd: APP, surface: 'terminal', isInteractive: true })
  await settle(clock)
  await $.classic.CwdChanged({ old_cwd: ROOT, new_cwd: APP })
  await settle(clock)
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Run the tests.`])
})

test('a directory change that is not a pending move submits nothing', async ($, on) => {
  const host = engine(on, () => new Promise(() => {}))
  const clock = mock.clock(on)
  await start($, on)
  await $.classic.CwdChanged({ old_cwd: ROOT, new_cwd: APP })
  await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
  await settle(clock)
  await $.classic.CwdChanged({ old_cwd: ROOT, new_cwd: `${ROOT}/other` })
  await settle(clock)
  expect(host.prompts).toEqual([])
})
