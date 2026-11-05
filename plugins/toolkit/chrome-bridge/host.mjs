// Chrome native messaging host for the toolkit's chrome bridge. Chrome starts it when the extension
// connects, and it runs until the extension disconnects. It moves messages between the extension and
// the session files next to it: comments in, requests out, replies back.
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HEARTBEAT_STALE_MS = 30_000
const ID = /^[A-Za-z0-9-]{1,64}$/

export function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message))
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length)
  return Buffer.concat([head, body])
}

/** Splits complete frames off the front of `buffer`; `rest` is the part of a frame not yet received. */
export function decodeFrames(buffer) {
  const messages = []
  let rest = buffer
  while (rest.length >= 4) {
    const length = rest.readUInt32LE(0)
    if (rest.length < 4 + length) break
    messages.push(JSON.parse(rest.subarray(4, 4 + length).toString()))
    rest = rest.subarray(4 + length)
  }
  return { messages, rest }
}

async function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, text)
  await rename(tmp, path)
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** Sessions whose toolkit wrote a heartbeat in the last 30 seconds. */
export async function liveSessions(root, now = Date.now()) {
  const dir = join(root, 'sessions')
  const names = await readdir(dir).catch(() => [])
  const sessions = []
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const s = await readJson(join(dir, name))
    if (!s || !ID.test(s.sessionId ?? '')) continue
    if (now - Date.parse(s.heartbeatAt) > HEARTBEAT_STALE_MS) continue
    sessions.push({ sessionId: s.sessionId, name: s.name, cwd: s.cwd })
  }
  return sessions
}

async function saveComment(root, comment, png) {
  if (!comment || !ID.test(comment.id ?? '') || !ID.test(comment.sessionId ?? '')) {
    return { type: 'error', id: comment?.id ?? '', error: 'The comment has no valid id or session.' }
  }
  const live = await liveSessions(root)
  if (!live.some(s => s.sessionId === comment.sessionId)) {
    return { type: 'error', id: comment.id, error: 'That Claude Code session is not running.' }
  }
  const saved = { ...comment }
  if (typeof png === 'string' && png.length > 0) {
    await mkdir(join(root, 'shots'), { recursive: true })
    saved.shot = join(root, 'shots', `${comment.id}.png`)
    await writeFile(saved.shot, Buffer.from(png, 'base64'))
  }
  await mkdir(join(root, 'comments'), { recursive: true })
  await appendFile(join(root, 'comments', `${comment.sessionId}.jsonl`), `${JSON.stringify(saved)}\n`)
  return { type: 'saved', id: comment.id }
}

/** The host's answer to one message from the extension, or undefined when it needs none. */
export async function handle(root, message) {
  switch (message?.type) {
    case 'hello':
      return { type: 'hello', version: ((await readFile(join(root, 'version'), 'utf8').catch(() => '')) || '').trim() }
    case 'sessions':
      return { type: 'sessions', sessions: await liveSessions(root) }
    case 'comment':
      return saveComment(root, message.comment, message.png)
    case 'reply': {
      const id = message.reply?.id
      if (!ID.test(id ?? '')) return undefined
      await mkdir(join(root, 'replies'), { recursive: true })
      await writeAtomic(join(root, 'replies', `${id}.json`), JSON.stringify(message.reply))
      return undefined
    }
    default:
      return { type: 'error', id: '', error: `Unknown message type: ${String(message?.type)}` }
  }
}

/** Takes every waiting request off disk, oldest first, so each one reaches the extension once. */
export async function takeRequests(root) {
  const dir = join(root, 'requests')
  const names = (await readdir(dir).catch(() => [])).filter(n => n.endsWith('.json')).sort()
  const requests = []
  for (const name of names) {
    const request = await readJson(join(dir, name))
    await rm(join(dir, name), { force: true })
    if (request && ID.test(request.id ?? '')) requests.push(request)
  }
  return requests
}

async function main() {
  const root = dirname(fileURLToPath(import.meta.url))
  const send = message => process.stdout.write(encodeFrame(message))
  let buffer = Buffer.alloc(0)
  let queue = Promise.resolve()
  process.stdin.on('data', chunk => {
    const { messages, rest } = decodeFrames(Buffer.concat([buffer, chunk]))
    buffer = rest
    for (const message of messages) {
      queue = queue.then(async () => {
        const answer = await handle(root, message).catch(err => ({ type: 'error', id: message?.comment?.id ?? '', error: String(err) }))
        if (answer) send(answer)
      })
    }
  })
  process.stdin.on('end', () => process.exit(0))
  setInterval(() => {
    queue = queue.then(async () => {
      for (const request of await takeRequests(root)) send({ type: 'request', request })
    })
  }, 300)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main()
