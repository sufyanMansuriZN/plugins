import type { EngineInterface } from 'claude-code'

import { isPlaceholder } from './blocks'

type Row = { type?: string; uuid?: string; isMeta?: boolean; timestamp?: string; message?: { content?: unknown } }
type Block = { type?: string; id?: string; text?: string; name?: string }

const blocks = (row: Row): Block[] => (Array.isArray(row.message?.content) ? (row.message.content as Block[]) : [])

// The end of a session's transcript: $.fs.read refuses files over 4 MiB, and a fork's starts as long as its parent's.
// It stays under the directory the session started in, which a cd or /cd does not move, so it is found by its id.
async function transcriptTail($: EngineInterface, home: string, sessionId: string): Promise<string> {
  const found = await $.process.run(['find', `${home}/.claude/projects`, '-maxdepth', '2', '-name', `${sessionId}.jsonl`], { timeoutMs: 10_000 }).catch(() => null)
  const path = found?.exitCode === 0 ? found.stdout.split('\n')[0] : ''
  if (!path) return ''
  const run = await $.process.run(['tail', '-c', '1000000', path], { timeoutMs: 10_000 }).catch(() => null)
  return run?.exitCode === 0 ? run.stdout : ''
}

/**
 * What `find` makes of this session's transcript once it holds the turn's last rows. The transcript
 * may lag the end of the turn, so it is read again for up to three seconds.
 */
export async function readTranscript<T>($: EngineInterface, find: (jsonl: string) => T | 'behind' | null): Promise<T | 'behind' | null> {
  const [home, sessionId] = await Promise.all([$.env.get('HOME').then(home => home ?? ''), $.session.id()])
  let found = find(await transcriptTail($, home, sessionId))
  for (let tries = 0; found === 'behind' && tries < 10; tries++) {
    await $.clock.sleep(300)
    found = find(await transcriptTail($, home, sessionId))
  }
  return found
}

/**
 * A turn's last reply text that says something, by that row's uuid, which is the reply block's
 * `requestId`, with the turn's rows. `'behind'` while the transcript does not yet hold the turn's final
 * text `answer`; null when the turn has no such text. Rows from before `since`, the turn's start, are
 * left out, so an earlier turn or a fork's parent never counts.
 */
export function replyAnchor(jsonl: string, since: number, answer: string): { uuid: string; turn: Row[] } | 'behind' | null {
  const turn: Row[] = []
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue
    try {
      const row = JSON.parse(line) as Row
      if (row.timestamp && Date.parse(row.timestamp) >= since) turn.push(row)
    } catch {
      // A line still being written, or the first one of a file read from its end.
    }
  }
  const texts = turn.flatMap(row => (row.type === 'assistant' && row.uuid ? blocks(row).flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? [{ uuid: row.uuid as string, text: block.text.trim() }] : [])) : []))
  const final = answer.trim()
  // The transcript has caught up once its last text row holds the start of the final text. Only the last
  // row counts, as a short answer such as `Done.` is often in earlier text too, and a placeholder such as
  // `.` must be that whole row.
  const last = texts.at(-1)?.text ?? ''
  if (final !== '' && !(isPlaceholder(final) ? last === final : last.includes(final.slice(0, 40)))) return 'behind'
  const anchor = texts.findLast(row => !isPlaceholder(row.text))
  return anchor ? { uuid: anchor.uuid, turn } : null
}
