import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__toolkit__change_session_directory'
const ROOT = '/w'
const APP = '/w/app'
const LINK = '/w/link-to-app'

type Host = { registered: string[]; asked: unknown[]; commands: { command: string; args: string }[]; prompts: string[] }
// What the person does with the dialog; `absent` is a `-p` run, where no dialog answers.
type Person = { answers: string } | 'dismisses' | 'absent'

// Beneath the plugin: a disk where LINK leads to APP and `notes.md` is a file, the person at the
// dialog, and the session's commands and prompts.
function engine(on: On, person: Person = { answers: 'Move' }): Host {
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
  if (person !== 'absent') {
    on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
      host.asked.push(e.questions)
      if (person === 'dismisses') return { deny: 'The person dismissed the dialog.' }
      const question = (e.questions[0] as { question: string }).question
      return { result: { questions: e.questions, answers: { [question]: person.answers } } }
    })
  }
  on('command.run', (_$, e) => {
    host.commands.push({ command: e.command, args: e.args })
    return {}
  })
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

test('an approved move runs /cd on the real path, then submits the task', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on)
  const call = await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
  expect(call.deny).toBeUndefined()
  expect(host.asked).toMatchObject([[{
    question: `Move this session to ${APP}?\nClaude's plan there: Run the tests.`,
    options: [{ label: 'Stay' }, { label: 'Move' }],
  }]])
  await settle(clock)
  expect(host.commands).toEqual([{ command: 'cd', args: APP }])
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Run the tests.`])
})

test('an approved move from a call that left out its task asks the model to carry on', async ($, on) => {
  const host = engine(on)
  const clock = mock.clock(on)
  await start($, on)
  await $.tool.call({ tool: TOOL, path: LINK })
  await settle(clock)
  expect(host.prompts).toEqual([`The session now runs in ${APP}. Continue the task you were on.`])
})

const NO_APPROVAL = "The move needs the person's approval, and none was given."
const refusals: { name: string; person: Person; isInteractive?: boolean; reason: string }[] = [
  { name: 'Stay', person: { answers: 'Stay' }, reason: 'The person chose to stay in the current directory.' },
  { name: 'text typed under Other', person: { answers: 'not now' }, reason: 'The person did not approve the move and said: not now' },
  { name: 'a dismissed dialog', person: 'dismisses', reason: NO_APPROVAL },
  { name: 'a -p run with no one to ask', person: 'absent', isInteractive: false, reason: NO_APPROVAL },
]

for (const refusal of refusals) {
  test(`${refusal.name} denies the move and runs no command`, async ($, on) => {
    const host = engine(on, refusal.person)
    const clock = mock.clock(on)
    await start($, on, refusal.isInteractive)
    const call = await $.tool.call({ tool: TOOL, path: LINK, task: 'Run the tests.' })
    expect(call).toEqual({ deny: refusal.reason })
    await settle(clock)
    expect(host.commands).toEqual([])
    expect(host.prompts).toEqual([])
  })
}
