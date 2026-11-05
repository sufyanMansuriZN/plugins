// Portions of this file are ported from T3Code (https://github.com/pingdotgg/t3code),
// apps/desktop/src/preview/PickedElementPayload.ts at commit 8b44f42b14c8:
// the shape checks for rects and numbers.
//
// MIT License
//
// Copyright (c) 2026 T3 Tools Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// The extension's service worker. It keeps one native messaging port to the host, owns the map
// from tab to session, opens tabs that a session asks for, adds the toolbar to them, and turns a
// comment from the toolbar into a `comment` message with a cropped screenshot.

'use strict'

const HOST = 'com.toolkit.chrome_bridge'
const RECONNECT_MS = 2_000
const VERSION_CHECK_MS = 10 * 60_000
const SESSIONS_WAIT_MS = 1_000
const SAVE_TIMEOUT_MS = 15_000
const SHOT_TTL_MS = 60_000
const SHOT_PADDING_CSS_PX = 16
const MAX_TEXT = 2_000
const NOT_CONNECTED = 'Not connected to Claude Code'

// ---- Shape checks (ported from PickedElementPayload.ts) ----

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value)

function isRect(value) {
  if (typeof value !== 'object' || value === null) return false
  return ['x', 'y', 'width', 'height'].every(key => isFiniteNumber(value[key]))
}

function isViewport(value) {
  if (typeof value !== 'object' || value === null) return false
  return ['width', 'height', 'scrollY', 'dpr'].every(key => isFiniteNumber(value[key])) && value.dpr > 0
}

function isOptionalString(value, max) {
  return value === undefined || (typeof value === 'string' && value.length <= max)
}

function isSection(value) {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  return typeof value.text === 'string' && isOptionalString(value.id, 1_000)
}

/** The toolbar's comment, checked before it goes to the host. */
function isToolbarComment(value) {
  if (typeof value !== 'object' || value === null) return false
  return (
    (value.kind === 'element' || value.kind === 'region') &&
    typeof value.body === 'string' &&
    value.body.trim().length > 0 &&
    isSection(value.section) &&
    isOptionalString(value.text, MAX_TEXT) &&
    isOptionalString(value.selector, 2_000) &&
    isRect(value.rect) &&
    isViewport(value.viewport)
  )
}

// ---- Tab ownership (chrome.storage.local key `tabs`; only this file writes it) ----

let storageQueue = Promise.resolve()

async function readTabs() {
  const { tabs } = await chrome.storage.local.get('tabs')
  return tabs && typeof tabs === 'object' ? tabs : {}
}

/** Serializes every change to `tabs` so two events cannot overwrite each other. */
function updateTabs(change) {
  storageQueue = storageQueue
    .then(async () => {
      const tabs = await readTabs()
      if (change(tabs) !== false) await chrome.storage.local.set({ tabs })
    })
    .catch(err => console.error('chrome bridge: could not update tabs', err))
  return storageQueue
}

async function ownerOf(tabId) {
  await storageQueue
  return (await readTabs())[String(tabId)]
}

async function injectToolbar(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['toolbar.js'] })
  } catch (err) {
    // Chrome pages, the Web Store and error pages refuse scripts. The tab keeps its owner.
    console.warn(`chrome bridge: could not add the toolbar to tab ${tabId}:`, err?.message ?? err)
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  // A completed load, or a same-document navigation (history API) that changes the URL.
  if (changeInfo.status !== 'complete' && changeInfo.url === undefined) return
  if (!(await ownerOf(tabId))) return
  await injectToolbar(tabId)
})

chrome.tabs.onRemoved.addListener(tabId => {
  updateTabs(tabs => {
    if (!(String(tabId) in tabs)) return false
    delete tabs[String(tabId)]
  })
})

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  // A prerendered page took the tab's place. The owner moves with it.
  updateTabs(tabs => {
    const owner = tabs[String(removedTabId)]
    if (!owner) return false
    delete tabs[String(removedTabId)]
    tabs[String(addedTabId)] = owner
  })
})

chrome.action.onClicked.addListener(tab => {
  console.log('chrome bridge: the session picker comes in a later version. Tab', tab.id)
})

/** At worker start: drop owners of tabs that closed while the worker was down, and add the toolbar again. */
async function restoreOwnedTabs() {
  const owned = Object.keys(await readTabs())
  for (const key of owned) {
    const tabId = Number(key)
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    if (!tab) {
      await updateTabs(tabs => {
        delete tabs[key]
      })
    } else if (tab.status === 'complete') {
      await injectToolbar(tabId)
    }
  }
}

// ---- Native messaging port ----

let port = null
let connected = false
let reconnectTimer = null
let versionTimer = null
let latestSessions = []
const sessionsWaiters = []
const pendingSaves = new Map() // comment id -> { resolve, timer }

function post(message) {
  if (!port) return false
  try {
    port.postMessage(message)
    return true
  } catch (err) {
    console.warn('chrome bridge: could not post to the host:', err?.message ?? err)
    return false
  }
}

function connect() {
  if (port) return
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  try {
    port = chrome.runtime.connectNative(HOST)
  } catch (err) {
    console.warn('chrome bridge: connectNative failed:', err?.message ?? err)
    port = null
    scheduleReconnect()
    return
  }
  port.onMessage.addListener(onHostMessage)
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message
    console.warn('chrome bridge: host disconnected', reason ?? '')
    port = null
    connected = false
    clearInterval(versionTimer)
    versionTimer = null
    for (const [id, pending] of pendingSaves) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: NOT_CONNECTED })
      pendingSaves.delete(id)
    }
    scheduleReconnect()
  })
  post({ type: 'hello' })
  post({ type: 'sessions' })
  clearInterval(versionTimer)
  versionTimer = setInterval(() => post({ type: 'hello' }), VERSION_CHECK_MS)
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, RECONNECT_MS)
}

/** The host's version changed since the last hello: the toolkit copied new files, so load them. */
async function checkVersion(version) {
  if (typeof version !== 'string' || version === '') return
  const { hostVersion } = await chrome.storage.local.get('hostVersion')
  if (hostVersion === version) return
  await chrome.storage.local.set({ hostVersion: version })
  if (typeof hostVersion === 'string' && hostVersion !== '') {
    console.log(`chrome bridge: toolkit version ${hostVersion} -> ${version}, reloading`)
    chrome.runtime.reload()
  }
}

function onHostMessage(message) {
  if (typeof message !== 'object' || message === null) return
  switch (message.type) {
    case 'hello':
      connected = true
      void checkVersion(message.version)
      return
    case 'sessions':
      if (Array.isArray(message.sessions)) {
        latestSessions = message.sessions.filter(
          s => s && typeof s.sessionId === 'string' && typeof s.name === 'string',
        )
      }
      for (const resolve of sessionsWaiters.splice(0)) resolve(latestSessions)
      return
    case 'saved':
    case 'error': {
      const pending = pendingSaves.get(message.id)
      if (!pending) {
        if (message.type === 'error') console.warn('chrome bridge: host error:', message.error)
        return
      }
      clearTimeout(pending.timer)
      pendingSaves.delete(message.id)
      pending.resolve(
        message.type === 'saved'
          ? { ok: true }
          : { ok: false, error: typeof message.error === 'string' ? message.error : 'The host could not save the comment.' },
      )
      return
    }
    case 'request':
      void handleRequest(message.request)
      return
    default:
      console.warn('chrome bridge: unknown message from the host:', message.type)
  }
}

/** Asks the host for the running sessions and waits briefly; falls back to the last answer. */
function freshSessions() {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      const index = sessionsWaiters.indexOf(done)
      if (index >= 0) sessionsWaiters.splice(index, 1)
      resolve(latestSessions)
    }, SESSIONS_WAIT_MS)
    function done(sessions) {
      clearTimeout(timer)
      resolve(sessions)
    }
    sessionsWaiters.push(done)
    if (!post({ type: 'sessions' })) done(latestSessions)
  })
}

function sendReply(reply) {
  post({ type: 'reply', reply })
}

async function handleRequest(request) {
  if (typeof request !== 'object' || request === null || typeof request.id !== 'string') return
  if (request.type !== 'open') {
    sendReply({ id: request.id, ok: false, error: 'not supported yet' })
    return
  }
  try {
    if (typeof request.sessionId !== 'string' || request.sessionId === '') throw new Error('The request has no session.')
    let url
    try {
      url = new URL(request.url)
    } catch {
      throw new Error('That is not a valid URL.')
    }
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
      throw new Error('Only http, https and file URLs can be opened.')
    }
    const sessions = await freshSessions()
    const session = sessions.find(s => s.sessionId === request.sessionId)
    const owner = { sessionId: request.sessionId, sessionName: session?.name || request.sessionId.slice(0, 8) }
    const tab = await chrome.tabs.create({ url: url.href, active: true })
    if (tab.id === undefined) throw new Error('Chrome did not give the new tab an ID.')
    await updateTabs(tabs => {
      tabs[String(tab.id)] = owner
    })
    // The toolbar is added by onUpdated when the load completes. A fast load may finish before
    // the owner was written, so check once here as well.
    const now = await chrome.tabs.get(tab.id).catch(() => undefined)
    if (now?.status === 'complete') await injectToolbar(tab.id)
    sendReply({ id: request.id, ok: true, tabId: tab.id })
  } catch (err) {
    sendReply({ id: request.id, ok: false, error: String(err?.message ?? err) })
  }
}

// ---- Screenshots ----

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Captures the visible tab and crops it to `clip` (viewport CSS px) plus padding, clamped to the image. */
async function captureCrop(windowId, clip, dpr) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
  const bitmap = await createImageBitmap(
    new Blob([base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1))], { type: 'image/png' }),
  )
  try {
    const pad = SHOT_PADDING_CSS_PX * dpr
    const left = Math.max(0, Math.floor(clip.x * dpr - pad))
    const top = Math.max(0, Math.floor(clip.y * dpr - pad))
    const right = Math.min(bitmap.width, Math.ceil((clip.x + clip.width) * dpr + pad))
    const bottom = Math.min(bitmap.height, Math.ceil((clip.y + clip.height) * dpr + pad))
    const width = right - left
    const height = bottom - top
    if (width < 1 || height < 1) return undefined
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d').drawImage(bitmap, left, top, width, height, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
  } finally {
    bitmap.close()
  }
}

const shots = new Map() // token -> { tabId, png, timer }

function takeShot(token, tabId) {
  const shot = shots.get(token)
  if (!shot || shot.tabId !== tabId) return undefined
  clearTimeout(shot.timer)
  shots.delete(token)
  return shot.png
}

// ---- Messages from the toolbar ----

async function onToolbarMessage(message, tab) {
  const owner = await ownerOf(tab.id)
  if (!owner) return { ok: false, error: 'This tab has no Claude Code session.' }

  switch (message.type) {
    case 'toolbar-hello':
      return { ok: true, sessionName: owner.sessionName, connected }

    case 'capture': {
      // Step 1 of a send. The toolbar has hidden itself, so the shot shows only the page.
      if (!connected) return { ok: false, error: NOT_CONNECTED }
      if (!isRect(message.clip) || !isFiniteNumber(message.dpr) || message.dpr <= 0) {
        return { ok: false, error: 'The toolbar sent a bad target.' }
      }
      const token = crypto.randomUUID()
      let png
      try {
        if (tab.active) png = await captureCrop(tab.windowId, message.clip, message.dpr)
      } catch (err) {
        // The comment matters more than the picture: send it without one.
        console.warn('chrome bridge: screenshot failed:', err?.message ?? err)
      }
      shots.set(token, { tabId: tab.id, png, timer: setTimeout(() => shots.delete(token), SHOT_TTL_MS) })
      return { ok: true, token }
    }

    case 'send': {
      // Step 2 of a send: the comment itself.
      const input = message.comment
      if (!isToolbarComment(input)) return { ok: false, error: 'The toolbar sent a bad comment.' }
      if (!connected) return { ok: false, error: NOT_CONNECTED }
      const id = crypto.randomUUID()
      const comment = {
        id,
        at: new Date().toISOString(),
        sessionId: owner.sessionId,
        tabId: tab.id,
        url: tab.url ?? '',
        title: tab.title ?? '',
        kind: input.kind,
        threadId: id,
        body: input.body,
        ...(input.section ? { section: { text: input.section.text, ...(input.section.id ? { id: input.section.id } : {}) } } : {}),
        ...(input.text ? { text: input.text.slice(0, MAX_TEXT) } : {}),
        ...(input.kind === 'element' && input.selector ? { selector: input.selector } : {}),
        rect: input.rect,
        viewport: input.viewport,
      }
      const png = typeof message.token === 'string' ? takeShot(message.token, tab.id) : undefined
      const result = await new Promise(resolve => {
        const timer = setTimeout(() => {
          pendingSaves.delete(id)
          resolve({ ok: false, error: 'Claude Code did not confirm the comment in time.' })
        }, SAVE_TIMEOUT_MS)
        pendingSaves.set(id, { resolve, timer })
        if (!post({ type: 'comment', comment, ...(png ? { png } : {}) })) {
          clearTimeout(timer)
          pendingSaves.delete(id)
          resolve({ ok: false, error: NOT_CONNECTED })
        }
      })
      return result.ok ? { ok: true, id, sessionName: owner.sessionName } : result
    }

    default:
      return { ok: false, error: 'Unknown toolbar message.' }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension's own toolbar, in the top frame of a tab, may talk to the worker.
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.tab.id === undefined || sender.frameId !== 0) return false
  if (typeof message !== 'object' || message === null) return false
  onToolbarMessage(message, sender.tab)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: String(err?.message ?? err) }))
  return true
})

// The toolbar holds a port open only so it can tell when the extension reloads.
chrome.runtime.onConnect.addListener(p => {
  if (p.name !== 'toolbar' || p.sender?.id !== chrome.runtime.id) p.disconnect()
})

// ---- Start ----

chrome.runtime.onStartup.addListener(connect)
chrome.runtime.onInstalled.addListener(connect)
connect()
void restoreOwnedTabs()
