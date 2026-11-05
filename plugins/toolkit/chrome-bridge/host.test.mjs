import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { decodeFrames, encodeFrame, handle, liveSessions, takeRequests } from './host.mjs'

async function bridge(sessions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chrome-bridge-'))
  await mkdir(join(root, 'sessions'))
  for (const [sessionId, heartbeatAt] of Object.entries(sessions)) {
    await writeFile(join(root, 'sessions', `${sessionId}.json`), JSON.stringify({ sessionId, name: `name-${sessionId}`, cwd: '/w', heartbeatAt }))
  }
  return root
}

const comment = (id, sessionId) => ({ id, sessionId, at: 'now', tabId: 1, url: 'https://x', title: 't', kind: 'element', threadId: id, body: 'too much padding', rect: { x: 0, y: 0, width: 1, height: 1 }, viewport: { width: 1, height: 1, scrollY: 0, dpr: 1 } })

test('frames survive being split across reads', () => {
  const bytes = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: 'two' })])
  const first = decodeFrames(bytes.subarray(0, 7))
  assert.deepEqual(first.messages, [])
  const all = decodeFrames(Buffer.concat([first.rest, bytes.subarray(7)]))
  assert.deepEqual(all.messages, [{ a: 1 }, { b: 'two' }])
  assert.equal(all.rest.length, 0)
})

test('only sessions with a fresh heartbeat are listed', async () => {
  const now = Date.now()
  const root = await bridge({ fresh: new Date(now - 5_000).toISOString(), stale: new Date(now - 60_000).toISOString() })
  assert.deepEqual(await liveSessions(root, now), [{ sessionId: 'fresh', name: 'name-fresh', cwd: '/w' }])
})

test('a comment lands in its own session file only, with its PNG', async () => {
  const now = new Date().toISOString()
  const root = await bridge({ a: now, b: now })
  const png = Buffer.from([137, 80, 78, 71]).toString('base64')
  assert.deepEqual(await handle(root, { type: 'comment', comment: comment('c1', 'a'), png }), { type: 'saved', id: 'c1' })
  const lines = (await readFile(join(root, 'comments', 'a.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].body, 'too much padding')
  assert.equal(lines[0].shot, join(root, 'shots', 'c1.png'))
  assert.deepEqual([...(await readFile(lines[0].shot))], [137, 80, 78, 71])
  assert.deepEqual(await readdir(join(root, 'comments')), ['a.jsonl'])
})

test('a comment for a session that is not running is refused and not written', async () => {
  const root = await bridge({ a: new Date(Date.now() - 60_000).toISOString() })
  const answer = await handle(root, { type: 'comment', comment: comment('c1', 'a') })
  assert.equal(answer.type, 'error')
  assert.deepEqual(await readdir(root), ['sessions'])
})

test('ids that could leave the folder are refused', async () => {
  const root = await bridge({ a: new Date().toISOString() })
  assert.equal((await handle(root, { type: 'comment', comment: comment('../x', 'a') })).type, 'error')
  assert.equal((await handle(root, { type: 'comment', comment: comment('c1', '../a') })).type, 'error')
  assert.equal(await handle(root, { type: 'reply', reply: { id: '../x', ok: true } }), undefined)
  assert.deepEqual(await readdir(root), ['sessions'])
})

test('a reply is written for the session to read', async () => {
  const root = await bridge()
  await handle(root, { type: 'reply', reply: { id: 'r1', ok: true, tabId: 7 } })
  assert.deepEqual(JSON.parse(await readFile(join(root, 'replies', 'r1.json'), 'utf8')), { id: 'r1', ok: true, tabId: 7 })
})

test('each request is taken once, oldest name first', async () => {
  const root = await bridge()
  await mkdir(join(root, 'requests'))
  await writeFile(join(root, 'requests', '2-b.json'), JSON.stringify({ id: 'b', type: 'open' }))
  await writeFile(join(root, 'requests', '1-a.json'), JSON.stringify({ id: 'a', type: 'open' }))
  assert.deepEqual((await takeRequests(root)).map(r => r.id), ['a', 'b'])
  assert.deepEqual(await takeRequests(root), [])
})

test('the running host answers hello and forwards a request over stdio', async () => {
  const root = await bridge()
  const script = fileURLToPath(new URL('./host.mjs', import.meta.url))
  await writeFile(join(root, 'version'), '9.9.9\n')
  await writeFile(join(root, 'host.mjs'), await readFile(script))
  await mkdir(join(root, 'requests'))
  const child = spawn(process.execPath, [join(root, 'host.mjs'), 'chrome-extension://test/'])
  let out = Buffer.alloc(0)
  const got = []
  const waitFor = n => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out with ${JSON.stringify(got)}`)), 3000)
    child.stdout.on('data', chunk => {
      const { messages, rest } = decodeFrames(Buffer.concat([out, chunk]))
      out = rest
      got.push(...messages)
      if (got.length >= n) { clearTimeout(timer); resolve() }
    })
  })
  const done = waitFor(2)
  child.stdin.write(encodeFrame({ type: 'hello' }))
  await writeFile(join(root, 'requests', '1-r.json'), JSON.stringify({ id: 'r', sessionId: 's', type: 'open', url: 'https://x' }))
  await done
  child.kill()
  assert.deepEqual(got.find(m => m.type === 'hello'), { type: 'hello', version: '9.9.9' })
  assert.deepEqual(got.find(m => m.type === 'request'), { type: 'request', request: { id: 'r', sessionId: 's', type: 'open', url: 'https://x' } })
})
