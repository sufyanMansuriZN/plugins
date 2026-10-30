import type { Register } from 'claude-code'

/** The folder of the usage logs, one file per session: `<session id>.jsonl`. */
export const usageDir = (home: string) => `${home}/.claude/toolkit/usage`

// A press on what the toolkit draws leaves no trace in the transcript, so each one gets a line in the
// session's own log: the time, the component it was drawn in and the button's key. A link's target, the
// reply's text and an answer's label stay out. `scripts/usage.py` reads the logs beside the transcripts.
export const register: Register = on => {
  // $.fs has no append, so each press reads the log and writes it back, one at a time, so none is lost.
  let queue: Promise<unknown> = Promise.resolve()

  on('ui.press', { plugin: 'toolkit' }, async ($, e, next) => {
    const line = JSON.stringify({ at: new Date().toISOString(), component: e.component, element: e.element })
    queue = queue
      .then(async () => {
        const [home, sessionId] = await Promise.all([$.env.get('HOME'), $.session.id()])
        if (!home) return
        const path = `${usageDir(home)}/${sessionId}.jsonl`
        const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
        await $.fs.write(path, `${before}${line}\n`)
      })
      .catch(() => undefined)
    return next(e)
  })
}
