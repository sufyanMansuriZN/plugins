// Ported from T3Code (https://github.com/pingdotgg/t3code) at commit 8b44f42b14c8:
// apps/desktop/src/preview/PickPreload.ts (element picking, region picking, the comment editor
// beside the target, the toolbar), AnnotationKeyboard.ts (the Enter rule), AnnotationIds.ts (local
// ids) and Annotation.css (the theme tokens). Left out: the style editor, the recording cursor, the
// React source lookup, Draw and Erase, multi-select, and the Electron preload and IPC.
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

// The review toolbar. The background adds it with chrome.scripting.executeScript to tabs that a
// Claude Code session owns. It runs in the extension's isolated world, mounts in a closed shadow
// root, and acts only on trusted (real user) events, so page scripts cannot drive it.

;(() => {
  'use strict'

  // The guard lives in the isolated world: page scripts cannot see or set it.
  const INSTANCE = Symbol.for('toolkit.chrome-bridge.toolbar')
  const previous = globalThis[INSTANCE]
  if (previous && previous.ensureMounted()) return
  if (previous) previous.teardown()

  const HOST_ATTRIBUTE = 'data-toolkit-chrome-bridge'
  const Z_INDEX_OVERLAY = 2147483646
  const CONTENT_LAYER_Z_INDEX = 1
  const CHROME_LAYER_Z_INDEX = 10
  const PRIMARY = 'var(--t3-primary)'
  const PRIMARY_FILL = 'color-mix(in srgb, var(--t3-primary) 10%, transparent)'
  const REGION_FILL = 'color-mix(in srgb, var(--t3-primary) 6%, transparent)'
  const MAX_TEXT = 2000
  const MAX_SECTION_TEXT = 200
  const MAX_REGION_ELEMENTS = 200
  const NOT_CONNECTED = 'Not connected to Claude Code'

  // A toolbar left over from an earlier load of the extension has lost its connection. Remove it.
  for (const stale of document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)) stale.remove()

  // ---- Ported from AnnotationIds.ts ----

  /** Per-load nonces avoid id collisions; getRandomValues works on plain HTTP. */
  function createAnnotationIdSource() {
    const pageLoad = Array.from(crypto.getRandomValues(new Uint32Array(2)), part => part.toString(36)).join('')
    let sequence = 0
    return prefix => {
      sequence += 1
      return `${prefix}_${pageLoad}_${sequence.toString(36)}`
    }
  }
  const nextId = createAnnotationIdSource()

  // ---- Ported from AnnotationKeyboard.ts ----

  /** Enter sends. Shift+Enter makes a new line, and Enter while an IME is composing does nothing. */
  function isSubmitKey(event) {
    return event.key === 'Enter' && !event.shiftKey && !event.isComposing
  }

  // ---- Theme (tokens from Annotation.css; hand-written rules in place of the Tailwind build) ----

  const STYLES = `
:host {
  all: initial;
  --t3-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --t3-font-mono: "SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace;
  --t3-radius: 0.625rem;
  --t3-background: white;
  --t3-foreground: oklch(0.269 0 0);
  --t3-popover: white;
  --t3-popover-foreground: oklch(0.269 0 0);
  --t3-primary: oklch(0.488 0.217 264);
  --t3-primary-foreground: white;
  --t3-muted: rgb(0 0 0 / 4%);
  --t3-muted-foreground: oklch(0.45 0 0);
  --t3-accent: rgb(0 0 0 / 6%);
  --t3-border: rgb(0 0 0 / 14%);
  --t3-input: rgb(0 0 0 / 10%);
  --t3-ring: oklch(0.488 0.217 264);
  --badge: #ffd400;
  --badge-foreground: #000;
  color: var(--t3-foreground);
  font-family: var(--t3-font-sans);
  font-size: 14px;
  line-height: 1.4;
}
* { box-sizing: border-box; }
button, textarea { font: inherit; color: inherit; }
button:focus-visible, textarea:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--t3-ring) 72%, transparent);
  outline-offset: -2px;
}
.root { position: fixed; inset: 0; pointer-events: none; }
.toolbar {
  pointer-events: auto; position: fixed; right: 12px; bottom: 12px;
  display: flex; align-items: center; gap: 2px; padding: 4px;
  border: 1px solid var(--t3-border); border-radius: var(--t3-radius);
  background: color-mix(in srgb, var(--t3-popover) 96%, transparent);
  color: var(--t3-popover-foreground);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  backdrop-filter: blur(24px);
}
.owner {
  height: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: calc(var(--t3-radius) - 2px);
  background: transparent; cursor: pointer;
  font-size: 12px; font-weight: 600; color: var(--t3-muted-foreground);
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.owner:hover { background: var(--t3-accent); color: var(--t3-foreground); }
.owner.none { background: var(--badge); color: var(--badge-foreground); }
.picker {
  pointer-events: auto; position: fixed; right: 12px; bottom: 58px; display: none; flex-direction: column;
  width: min(320px, calc(100vw - 24px)); max-height: min(380px, calc(100vh - 80px));
  border: 1px solid var(--t3-border); border-radius: calc(var(--t3-radius) + 4px);
  background: color-mix(in srgb, var(--t3-popover) 98%, transparent); color: var(--t3-popover-foreground);
  box-shadow: 0 16px 40px rgb(0 0 0 / 22%); backdrop-filter: blur(24px); overflow: hidden;
}
.picker .title { padding: 10px 12px 6px; font-size: 12px; font-weight: 700; }
.picker .note { margin: 0 12px 6px; padding: 2px 6px; border-radius: 4px; justify-self: start; align-self: flex-start; font-size: 12px; font-weight: 600; background: var(--badge); color: var(--badge-foreground); }
.picker .note:empty { display: none; }
.picker .list { display: flex; flex-direction: column; gap: 2px; padding: 0 6px 6px; overflow-y: auto; }
.picker .session {
  display: grid; gap: 1px; justify-items: start; text-align: left; width: 100%; padding: 6px 8px;
  border: 1px solid transparent; border-radius: 8px; background: transparent; cursor: pointer;
}
.picker .session:hover { background: var(--t3-accent); }
.picker .session[aria-current="true"] { border-color: var(--t3-foreground); }
.picker .session b { font-size: 13px; }
.picker .session small {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--t3-font-mono); font-size: 11px; color: var(--t3-muted-foreground);
}
.picker .empty { padding: 4px 12px 8px; font-size: 12px; color: var(--t3-muted-foreground); }
.picker .empty code { font-family: var(--t3-font-mono); }
.picker .foot { display: flex; justify-content: flex-end; padding: 6px 8px; border-top: 1px solid var(--t3-border); }
.picker .refresh { height: 26px; padding: 0 8px; font-size: 12px; border-color: var(--t3-border); }
.btn {
  display: inline-flex; align-items: center; justify-content: center; height: 30px; padding: 0 10px;
  border: 1px solid transparent; border-radius: calc(var(--t3-radius) - 2px);
  background: transparent; cursor: pointer; font-size: 13px; font-weight: 500;
}
.btn.icon { width: 30px; padding: 0; }
.btn svg { width: 17px; height: 17px; flex: none; }
.btn.primary svg { width: 15px; height: 15px; margin-right: 4px; }
.btn:hover { background: var(--t3-accent); }
.btn[aria-pressed="true"] { border-color: var(--t3-foreground); background: var(--t3-accent); font-weight: 700; }
.btn[disabled] { opacity: 0.45; pointer-events: none; }
.btn.primary { background: var(--t3-primary); color: var(--t3-primary-foreground); border-color: var(--t3-primary); }
.editor {
  pointer-events: auto; position: fixed; display: none; flex-direction: column;
  width: min(360px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow: hidden;
  border: 1px solid var(--t3-border); border-radius: calc(var(--t3-radius) + 4px);
  background: color-mix(in srgb, var(--t3-popover) 97%, transparent);
  color: var(--t3-popover-foreground);
  box-shadow: 0 16px 40px rgb(0 0 0 / 22%);
  backdrop-filter: blur(24px);
}
.composer { display: flex; align-items: flex-start; gap: 8px; padding: 8px; }
.comment {
  flex: 1; min-width: 0; min-height: 32px; max-height: 96px; resize: none; overflow-y: hidden;
  border: 0; border-bottom: 1px solid transparent; background: transparent;
  padding: 6px 0; font-size: 14px; line-height: 20px; outline: none;
}
.comment:focus { border-bottom-color: var(--t3-primary); outline: none; }
.comment::placeholder { color: var(--t3-muted-foreground); }
.status { display: none; padding: 0 10px 8px; font-size: 12px; font-weight: 600; }
.status.shown { display: block; }
.label {
  position: fixed; max-width: 280px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  padding: 2px 8px; border-radius: 6px; pointer-events: none;
  background: var(--t3-primary); color: var(--t3-primary-foreground);
  font-family: var(--t3-font-mono); font-size: 12px; font-weight: 600;
}
.pin {
  position: fixed; max-width: 320px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  padding: 3px 9px; border: 2px solid #000; border-radius: 999px; pointer-events: auto;
  background: var(--badge); color: var(--badge-foreground);
  font-size: 12px; font-weight: 700; box-shadow: 0 2px 8px rgb(0 0 0 / 25%);
}
.pin.error { background: #fff; white-space: normal; border-radius: 8px; }
.pin.thread {
  width: 24px; height: 24px; padding: 0; display: grid; place-items: center; cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.pin.thread.unread { box-shadow: 0 0 0 3px var(--t3-primary), 0 2px 8px rgb(0 0 0 / 25%); }
.pin.thread.resolved { background: #d4d4d4; border-color: #6b6b6b; color: #3a3a3a; }
.panel {
  pointer-events: auto; position: fixed; display: none; flex-direction: column;
  width: min(340px, calc(100vw - 16px)); max-height: min(440px, calc(100vh - 16px));
  border: 1px solid var(--t3-border); border-radius: calc(var(--t3-radius) + 4px);
  background: color-mix(in srgb, var(--t3-popover) 98%, transparent); color: var(--t3-popover-foreground);
  box-shadow: 0 16px 40px rgb(0 0 0 / 22%); backdrop-filter: blur(24px); overflow: hidden;
}
.panel .head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; border-bottom: 1px solid var(--t3-border); }
.panel .num {
  width: 20px; height: 20px; flex: none; display: grid; place-items: center; border-radius: 50%;
  border: 1.5px solid #000; background: var(--badge); color: var(--badge-foreground); font-size: 11px; font-weight: 700;
}
.panel .who { font-weight: 600; font-size: 13px; white-space: nowrap; }
.panel .where {
  flex: 1; min-width: 0; color: var(--t3-muted-foreground); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.panel .small { height: 26px; padding: 0 8px; font-size: 12px; font-weight: 600; border-color: var(--t3-border); }
.panel .small.confirm { background: var(--t3-primary); color: var(--t3-primary-foreground); border-color: var(--t3-primary); }
.panel .close { width: 26px; height: 26px; padding: 0; font-size: 16px; color: var(--t3-muted-foreground); }
.panel .msgs { display: flex; flex-direction: column; gap: 12px; padding: 12px; overflow-y: auto; }
.panel .msg { display: grid; grid-template-columns: 24px 1fr; gap: 2px 8px; }
.panel .av {
  grid-row: span 2; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%;
  background: var(--t3-accent); font-size: 11px; font-weight: 700;
}
.panel .av.claude { background: var(--t3-primary); color: var(--t3-primary-foreground); }
.panel .name { font-size: 12px; font-weight: 600; }
.panel .name span { margin-left: 6px; font-weight: 400; color: var(--t3-muted-foreground); }
.panel .text { font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.panel .waiting { display: flex; align-items: center; gap: 8px; padding: 0 12px 12px 44px; color: var(--t3-muted-foreground); font-size: 12px; }
.panel .waiting::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #e8a400; }
.panel .resolved-note { padding: 0 12px 12px 44px; color: var(--t3-muted-foreground); font-size: 12px; }
.panel .compose { display: flex; align-items: flex-end; gap: 6px; padding: 8px 8px 8px 12px; border-top: 1px solid var(--t3-border); }
.panel .reply {
  flex: 1; min-width: 0; min-height: 30px; max-height: 96px; resize: none; overflow-y: hidden;
  border: 0; background: transparent; padding: 5px 0; font-size: 13px; line-height: 20px; outline: none;
}
.panel .reply::placeholder { color: var(--t3-muted-foreground); }
.panel .status { padding: 0 12px 8px; }
`
  const PAGE_CURSOR_STYLES = 'html, html body, html body * { cursor: crosshair !important; }'

  // ---- Geometry helpers (ported from PickPreload.ts) ----

  const normalizeRect = (startX, startY, endX, endY) => ({
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  })

  const isUsableRect = rect => rect.width >= 3 && rect.height >= 3

  function intersectViewport(rect) {
    const left = Math.max(0, rect.x)
    const top = Math.max(0, rect.y)
    const right = Math.min(window.innerWidth, rect.x + rect.width)
    const bottom = Math.min(window.innerHeight, rect.y + rect.height)
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }

  function visibleElementRect(element) {
    const rect = element.getBoundingClientRect()
    let left = Math.max(0, rect.left)
    let top = Math.max(0, rect.top)
    let right = Math.min(document.documentElement.clientWidth, rect.right)
    let bottom = Math.min(document.documentElement.clientHeight, rect.bottom)
    if (getComputedStyle(element).position !== 'fixed') {
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor === document.body || ancestor === document.documentElement) break
        const style = getComputedStyle(ancestor)
        const bounds = ancestor.getBoundingClientRect()
        const clipLeft = bounds.left + ancestor.clientLeft
        const clipTop = bounds.top + ancestor.clientTop
        if (style.overflowX !== 'visible') {
          left = Math.max(left, clipLeft)
          right = Math.min(right, clipLeft + ancestor.clientWidth)
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, clipTop)
          bottom = Math.min(bottom, clipTop + ancestor.clientHeight)
        }
      }
    }
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }

  function describeRawElement(element) {
    const tag = element.tagName.toLowerCase()
    const id = element.id ? `#${element.id}` : ''
    const className = typeof element.className === 'string' ? element.className : ''
    const classes = className
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(name => `.${name}`)
      .join('')
    return `${tag}${id}${classes}`
  }

  function createBox(color, fill) {
    const node = document.createElement('div')
    node.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'pointer-events:none',
      `border:2px solid ${color}`,
      `background:${fill}`,
      'border-radius:3px',
      'box-sizing:border-box',
      'display:none',
      `z-index:${CONTENT_LAYER_Z_INDEX}`,
    ].join(';')
    return node
  }

  function positionBox(node, rect) {
    if (rect.width <= 0 || rect.height <= 0) {
      node.style.display = 'none'
      return
    }
    node.style.display = 'block'
    node.style.transform = `translate(${rect.x}px, ${rect.y}px)`
    node.style.width = `${rect.width}px`
    node.style.height = `${rect.height}px`
  }

  // ---- What is captured about a target (replaces PickedElementPayload and react-grab) ----

  const collapse = text => text.replace(/\s+/g, ' ').trim()

  function textOf(element) {
    const raw = element instanceof HTMLElement ? element.innerText : element.textContent
    return collapse(raw ?? '').slice(0, MAX_TEXT)
  }

  function isUnique(selector, element) {
    try {
      const found = document.querySelectorAll(selector)
      return found.length === 1 && found[0] === element
    } catch {
      return false
    }
  }

  /** A short CSS path: an id when it is unique, otherwise tag:nth-of-type steps up to six deep. */
  function cssPath(element) {
    if (element.id && isUnique(`#${CSS.escape(element.id)}`, element)) return `#${CSS.escape(element.id)}`
    const parts = []
    for (let node = element; node && node !== document.documentElement && parts.length < 6; node = node.parentElement) {
      if (node !== element && node.id && isUnique(`#${CSS.escape(node.id)}`, node)) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        break
      }
      let part = CSS.escape(node.localName)
      const parent = node.parentElement
      if (parent) {
        const same = Array.from(parent.children).filter(child => child.localName === node.localName)
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`
      }
      parts.unshift(part)
      if (isUnique(parts.join(' > '), element)) break
    }
    return parts.join(' > ')
  }

  /** The nearest heading at or above `anchor` in document order, with its id or an id inside it. */
  function sectionFor(anchor) {
    if (!anchor) return undefined
    let best = null
    for (const heading of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
      if (heading === anchor || heading.contains(anchor)) {
        best = heading
        continue
      }
      if (heading.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) best = heading
      else break
    }
    if (!best) return undefined
    const text = collapse(best.textContent ?? '').slice(0, MAX_SECTION_TEXT)
    if (!text) return undefined
    const id = best.id || best.querySelector('[id]')?.id || ''
    return id ? { text, id } : { text }
  }

  /** The text of the leaf elements whose centre is inside the region (T3Code's marquee rule). */
  function regionText(clip) {
    const parts = []
    let length = 0
    let seen = 0
    for (const element of document.querySelectorAll('body *')) {
      if (element === host || seen >= MAX_REGION_ELEMENTS || length >= MAX_TEXT) break
      const isLeafLike =
        element.children.length === 0 ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLAnchorElement ||
        element.getAttribute('role') === 'button'
      if (!isLeafLike) continue
      const rect = element.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      if (centerX < clip.x || centerX > clip.x + clip.width || centerY < clip.y || centerY > clip.y + clip.height) continue
      if (parts.length > 0 && parts[parts.length - 1].includes(element.textContent?.trim() || '\u0000')) continue
      seen += 1
      const text = textOf(element)
      if (!text) continue
      parts.push(text)
      length += text.length + 1
    }
    return parts.join('\n').slice(0, MAX_TEXT)
  }

  // ---- Talking to the background ----

  function ask(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime.lastError
          resolve(response ?? { ok: false, error: error?.message || 'No answer from the extension.' })
        })
      } catch (err) {
        resolve({ ok: false, error: String(err?.message ?? err) })
      }
    })
  }

  // ---- Mount ----

  let finished = false
  const host = document.createElement('div')
  host.setAttribute(HOST_ATTRIBUTE, '')
  host.setAttribute('dir', 'ltr')
  host.style.cssText = `all:initial !important;position:fixed !important;inset:0 !important;z-index:${Z_INDEX_OVERLAY} !important;pointer-events:none !important;display:block !important`
  const shadowRoot = host.attachShadow({ mode: 'closed' })
  // A constructed stylesheet, so a page's style-src CSP cannot block it.
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(STYLES)
  shadowRoot.adoptedStyleSheets = [sheet]
  const cursorSheet = new CSSStyleSheet()
  cursorSheet.replaceSync(PAGE_CURSOR_STYLES)

  const root = document.createElement('div')
  root.className = 'root'
  shadowRoot.appendChild(root)

  const hoverOutline = createBox(PRIMARY, PRIMARY_FILL)
  const marqueeBox = createBox(PRIMARY, PRIMARY_FILL)
  const targetOutline = createBox(PRIMARY, PRIMARY_FILL)
  const targetLabel = document.createElement('div')
  targetLabel.className = 'label'
  targetLabel.style.cssText = `display:none;left:0;top:0;z-index:${CONTENT_LAYER_Z_INDEX}`
  const pinLayer = document.createElement('div')
  root.append(hoverOutline, marqueeBox, targetOutline, targetLabel, pinLayer)

  // Built node by node, not with innerHTML, so a page's Trusted Types policy cannot block it.
  const ICONS = {
    select: [['path', { d: 'M4 4.5h12A1.5 1.5 0 0 1 17.5 6v7a1.5 1.5 0 0 1-1.5 1.5H9.5L6 17.5v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z' }]],
    marquee: [['rect', { x: '3', y: '4', width: '14', height: '12', rx: '1.5', 'stroke-dasharray': '3 2.2' }]],
    send: [['path', { d: 'M10 16V4M5 9l5-5 5 5' }]],
  }
  function icon(name) {
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    for (const [k, v] of Object.entries({ viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
    for (const [tag, attrs] of ICONS[name]) {
      const shape = document.createElementNS(NS, tag)
      for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v)
      svg.appendChild(shape)
    }
    return svg
  }

  const toolbar = document.createElement('div')
  toolbar.className = 'toolbar'
  toolbar.style.zIndex = String(CHROME_LAYER_Z_INDEX)
  const ownerLabel = document.createElement('button')
  ownerLabel.type = 'button'
  ownerLabel.className = 'owner'
  ownerLabel.textContent = 'Claude'
  toolbar.appendChild(ownerLabel)

  // The session list: opened by the extension icon, by this label, or when the session has ended.
  const picker = document.createElement('div')
  picker.className = 'picker'
  picker.style.zIndex = String(CHROME_LAYER_Z_INDEX)
  const pickerTitle = document.createElement('div')
  pickerTitle.className = 'title'
  pickerTitle.textContent = 'Send comments on this tab to'
  const pickerNote = document.createElement('div')
  pickerNote.className = 'note'
  const pickerList = document.createElement('div')
  pickerList.className = 'list'
  const pickerFoot = document.createElement('div')
  pickerFoot.className = 'foot'
  const refreshButton = document.createElement('button')
  refreshButton.type = 'button'
  refreshButton.className = 'btn refresh'
  refreshButton.textContent = 'Refresh'
  pickerFoot.appendChild(refreshButton)
  picker.append(pickerTitle, pickerNote, pickerList, pickerFoot)
  root.appendChild(toolbar)

  const editor = document.createElement('div')
  editor.className = 'editor'
  editor.style.zIndex = String(CHROME_LAYER_Z_INDEX)
  const composerRow = document.createElement('div')
  composerRow.className = 'composer'
  const comment = document.createElement('textarea')
  comment.className = 'comment'
  comment.placeholder = 'Describe the change…'
  comment.setAttribute('dir', 'auto')
  comment.setAttribute('aria-label', 'Comment for Claude')
  comment.rows = 1
  const submit = document.createElement('button')
  submit.type = 'button'
  submit.className = 'btn primary'
  submit.append(icon('send'), 'Send')
  submit.title = 'Send to Claude Code (Enter). New line: Shift+Enter. Cancel: Escape.'
  composerRow.append(comment, submit)
  const status = document.createElement('div')
  status.className = 'status'
  status.setAttribute('role', 'status')
  editor.append(composerRow, status)
  root.appendChild(editor)

  // The thread panel: one thread's messages and a reply box. Resolve sits in the header, away from Send.
  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.style.zIndex = String(CHROME_LAYER_Z_INDEX)
  const panelHead = document.createElement('div')
  panelHead.className = 'head'
  const panelNum = document.createElement('span')
  panelNum.className = 'num'
  const panelWho = document.createElement('span')
  panelWho.className = 'who'
  const panelWhere = document.createElement('span')
  panelWhere.className = 'where'
  const resolveButton = document.createElement('button')
  resolveButton.type = 'button'
  resolveButton.className = 'btn small'
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'btn close'
  closeButton.textContent = '×'
  closeButton.title = 'Close (Escape)'
  closeButton.setAttribute('aria-label', 'Close the thread')
  panelHead.append(panelNum, panelWho, panelWhere, resolveButton, closeButton)
  const panelMsgs = document.createElement('div')
  panelMsgs.className = 'msgs'
  const panelNote = document.createElement('div')
  const panelCompose = document.createElement('div')
  panelCompose.className = 'compose'
  const replyBox = document.createElement('textarea')
  replyBox.className = 'reply'
  replyBox.placeholder = 'Reply…'
  replyBox.setAttribute('dir', 'auto')
  replyBox.setAttribute('aria-label', 'Reply in the thread')
  replyBox.rows = 1
  const replySend = document.createElement('button')
  replySend.type = 'button'
  replySend.className = 'btn primary icon'
  replySend.title = 'Send the reply (Enter). New line: Shift+Enter.'
  replySend.setAttribute('aria-label', 'Send the reply')
  replySend.appendChild(icon('send'))
  panelCompose.append(replyBox, replySend)
  const panelStatus = document.createElement('div')
  panelStatus.className = 'status'
  panelStatus.setAttribute('role', 'status')
  panel.append(panelHead, panelMsgs, panelNote, panelCompose, panelStatus)
  root.appendChild(panel)
  root.appendChild(picker)

  // ---- State ----

  /** @type {'off' | 'select' | 'marquee'} */
  let tool = 'off'
  /** @type {null | { kind: 'element', element: Element } | { kind: 'region', rect: { x: number, y: number, width: number, height: number } }} */
  let target = null
  let dragStart = null
  let sending = false
  let sessionName = ''
  let editorLayoutFrame = null
  const pins = [] // { node, x, y } in page coordinates
  let threads = [] // this page's threads, oldest first, from the background
  let openThreadId = null
  let replying = false
  let resolveArmedTimer = null

  const toolButtons = new Map()
  const tools = [
    ['select', 'Comment', 'Pick an element to comment on (V)'],
    ['marquee', 'Region', 'Drag a box around a region (R)'],
  ]
  for (const [candidate, label, title] of tools) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn icon'
    button.appendChild(icon(candidate))
    button.title = title
    button.setAttribute('aria-label', label)
    button.addEventListener('click', event => {
      if (!event.isTrusted) return
      setTool(tool === candidate ? 'off' : candidate)
    })
    toolButtons.set(candidate, button)
    toolbar.appendChild(button)
  }

  const setStatus = (text) => {
    status.textContent = text
    status.classList.toggle('shown', text !== '')
  }

  function setTool(next) {
    tool = next
    for (const [candidate, button] of toolButtons) button.setAttribute('aria-pressed', String(candidate === tool))
    if (tool !== 'select') hoverOutline.style.display = 'none'
    if (tool !== 'marquee') marqueeBox.style.display = 'none'
    dragStart = null
    const sheets = document.adoptedStyleSheets
    if (tool === 'off') {
      if (sheets.includes(cursorSheet)) document.adoptedStyleSheets = sheets.filter(s => s !== cursorSheet)
    } else if (!sheets.includes(cursorSheet)) {
      document.adoptedStyleSheets = [...sheets, cursorSheet]
    }
  }

  // ---- Target and editor ----

  /** The target's rect in viewport coordinates, clipped to what is visible. */
  function targetClip() {
    if (!target) return null
    if (target.kind === 'element') return target.element.isConnected ? visibleElementRect(target.element) : null
    return intersectViewport({
      x: target.rect.x - window.scrollX,
      y: target.rect.y - window.scrollY,
      width: target.rect.width,
      height: target.rect.height,
    })
  }

  function paintTarget() {
    const clip = targetClip()
    if (!clip || clip.width === 0 || clip.height === 0) {
      targetOutline.style.display = 'none'
      targetLabel.style.display = 'none'
      return
    }
    positionBox(targetOutline, clip)
    if (target.kind === 'element') {
      targetOutline.style.background = PRIMARY_FILL
      targetLabel.textContent = describeRawElement(target.element)
      targetLabel.style.display = 'block'
      targetLabel.style.transform = `translate(${Math.max(4, clip.x)}px, ${Math.max(4, clip.y - 22)}px)`
    } else {
      targetOutline.style.background = REGION_FILL
      targetLabel.style.display = 'none'
    }
  }

  function setTarget(next) {
    const hadTarget = target !== null
    target = next
    paintTarget()
    editor.style.display = target ? 'flex' : 'none'
    if (target && !hadTarget) window.setTimeout(() => comment.focus({ preventScroll: true }), 0)
    queueEditorLayout()
  }

  function clearTarget() {
    setTarget(null)
    comment.value = ''
    setStatus('')
    resizeComment()
  }

  const clampEditorPosition = (left, top) => {
    const margin = 8
    const rect = editor.getBoundingClientRect()
    return {
      left: Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - rect.width - margin)),
      top: Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - rect.height - margin)),
    }
  }

  /** Puts the editor beside the target: right, left, below, then above, whichever overflows least. */
  function positionCompactEditor() {
    const bounds = targetClip()
    if (!bounds) return
    const editorRect = editor.getBoundingClientRect()
    const gap = 8
    const candidates = [
      { left: bounds.x + bounds.width + gap, top: bounds.y },
      { left: bounds.x - editorRect.width - gap, top: bounds.y },
      { left: bounds.x + bounds.width - editorRect.width, top: bounds.y + bounds.height + gap },
      { left: bounds.x + bounds.width - editorRect.width, top: bounds.y - editorRect.height - gap },
    ]
    const overflow = position =>
      Math.max(0, -position.left) +
      Math.max(0, -position.top) +
      Math.max(0, position.left + editorRect.width - window.innerWidth) +
      Math.max(0, position.top + editorRect.height - window.innerHeight)
    const best = candidates.reduce((current, candidate) => (overflow(candidate) < overflow(current) ? candidate : current))
    const clamped = clampEditorPosition(best.left, best.top)
    editor.style.left = `${clamped.left}px`
    editor.style.top = `${clamped.top}px`
  }

  function queueEditorLayout() {
    if (editorLayoutFrame !== null) window.cancelAnimationFrame(editorLayoutFrame)
    editorLayoutFrame = window.requestAnimationFrame(() => {
      editorLayoutFrame = null
      if (editor.style.display === 'none') return
      positionCompactEditor()
    })
  }

  function resizeComment() {
    const maxHeight = 96
    comment.style.height = 'auto'
    comment.style.height = `${Math.min(comment.scrollHeight, maxHeight)}px`
    comment.style.overflowY = comment.scrollHeight > maxHeight ? 'auto' : 'hidden'
    queueEditorLayout()
  }
  comment.addEventListener('input', resizeComment)

  // ---- Pins ----

  const threadPins = [] // { node, x, y, id } in page coordinates, one per thread

  function paintPins() {
    for (const pin of [...pins, ...threadPins]) {
      const left = Math.max(4, Math.min(window.innerWidth - 40, pin.x - window.scrollX))
      const top = Math.max(4, pin.y - window.scrollY - 26)
      pin.node.style.transform = `translate(${left}px, ${top}px)`
    }
  }

  function addPin(pageRect) {
    const node = document.createElement('div')
    node.className = 'pin'
    node.style.cssText = `left:0;top:0;z-index:${CONTENT_LAYER_Z_INDEX + 1}`
    node.id = nextId('pin')
    pinLayer.appendChild(node)
    const pin = { node, x: pageRect.x, y: pageRect.y }
    pins.push(pin)
    paintPins()
    return pin
  }

  function setPin(pin, text, isError) {
    pin.node.textContent = text
    pin.node.title = text
    pin.node.classList.toggle('error', isError)
  }

  function removePin(pin) {
    pin.node.remove()
    const index = pins.indexOf(pin)
    if (index >= 0) pins.splice(index, 1)
  }

  // ---- Threads ----

  const clock = iso => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  async function loadThreads() {
    const answer = await ask({ type: 'threads' })
    if (finished || !answer.ok) return
    threads = Array.isArray(answer.threads) ? answer.threads : []
    renderThreads()
  }

  function renderThreads() {
    for (const pin of threadPins.splice(0)) pin.node.remove()
    threads.forEach((t, index) => {
      const node = document.createElement('div')
      node.className = 'pin thread'
      node.classList.toggle('resolved', t.status === 'resolved')
      node.classList.toggle('unread', (t.unread || 0) > 0)
      node.textContent = String(index + 1)
      node.title = `${t.status === 'resolved' ? 'Resolved: ' : ''}${t.messages[0]?.text ?? ''}`
      node.style.cssText = `left:0;top:0;z-index:${CONTENT_LAYER_Z_INDEX + 1}`
      node.addEventListener('click', event => {
        if (!event.isTrusted) return
        openThreadId = openThreadId === t.id ? null : t.id
        renderPanel()
        if (openThreadId) window.setTimeout(() => replyBox.focus({ preventScroll: true }), 0)
      })
      pinLayer.appendChild(node)
      threadPins.push({ node, x: t.rect.x + t.rect.width - 12, y: t.rect.y + 14, id: t.id })
    })
    paintPins()
    renderPanel()
  }

  function messageNode(m, sessionLabel) {
    const row = document.createElement('div')
    row.className = 'msg'
    const avatar = document.createElement('span')
    avatar.className = m.from === 'claude' ? 'av claude' : 'av'
    avatar.textContent = m.from === 'claude' ? 'C' : 'Y'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = m.from === 'claude' ? sessionLabel : 'You'
    const time = document.createElement('span')
    time.textContent = clock(m.at)
    name.appendChild(time)
    const text = document.createElement('span')
    text.className = 'text'
    text.textContent = m.text
    row.append(avatar, name, text)
    return row
  }

  function setPanelStatus(text) {
    panelStatus.textContent = text
    panelStatus.classList.toggle('shown', text !== '')
  }

  function disarmResolve() {
    window.clearTimeout(resolveArmedTimer)
    resolveArmedTimer = null
    resolveButton.textContent = '✓ Resolve'
    resolveButton.title = 'Resolve the thread'
    resolveButton.classList.remove('confirm')
  }

  function renderPanel() {
    const index = threads.findIndex(t => t.id === openThreadId)
    if (index < 0) {
      openThreadId = null
      panel.style.display = 'none'
      setPanelStatus('')
      disarmResolve()
      return
    }
    const t = threads[index]
    const label = t.sessionName || sessionName || 'Claude Code'
    panelNum.textContent = String(index + 1)
    panelWho.textContent = label
    panelWhere.textContent = t.selector ? `· ${t.selector}` : '· region'
    panelWhere.title = t.selector || ''
    disarmResolve()
    resolveButton.style.display = t.status === 'resolved' ? 'none' : ''
    panelMsgs.replaceChildren(...t.messages.map(m => messageNode(m, label)))
    const last = t.messages[t.messages.length - 1]
    if (t.status === 'resolved') {
      panelNote.className = 'resolved-note'
      panelNote.textContent = 'Resolved. A reply opens it again.'
    } else if (last?.from === 'you') {
      panelNote.className = 'waiting'
      panelNote.textContent = `Waiting for ${label}`
    } else {
      panelNote.className = ''
      panelNote.textContent = ''
    }
    panel.style.display = 'flex'
    positionPanel()
    panelMsgs.scrollTop = panelMsgs.scrollHeight
    markReadIfSeen()
  }

  /** Below the thread's pin, or above it when there is no room below. */
  function positionPanel() {
    if (panel.style.display === 'none') return
    const pin = threadPins.find(p => p.id === openThreadId)
    if (!pin) return
    const box = panel.getBoundingClientRect()
    const pinLeft = pin.x - window.scrollX
    const pinTop = pin.y - window.scrollY - 26
    let top = pinTop + 30
    if (top + box.height > window.innerHeight - 8) top = pinTop - box.height - 6
    const left = Math.min(Math.max(8, pinLeft - 12), Math.max(8, window.innerWidth - box.width - 8))
    panel.style.left = `${left}px`
    panel.style.top = `${Math.max(8, top)}px`
  }

  /** An answer counts as read once its thread is open on a page you can see. */
  function markReadIfSeen() {
    const t = threads.find(x => x.id === openThreadId)
    if (!t || !t.unread || document.visibilityState !== 'visible') return
    t.unread = 0
    threadPins.find(p => p.id === t.id)?.node.classList.remove('unread')
    void ask({ type: 'read', threadId: t.id })
  }

  async function sendReply() {
    const threadId = openThreadId
    const body = replyBox.value.trim()
    if (replying || !threadId) return
    if (!body) {
      setPanelStatus('Type a reply first.')
      return
    }
    replying = true
    replySend.disabled = true
    setPanelStatus('')
    const viewport = { width: window.innerWidth, height: window.innerHeight, scrollY: window.scrollY, dpr: window.devicePixelRatio || 1 }
    const result = await ask({ type: 'reply', threadId, body, viewport })
    replying = false
    replySend.disabled = false
    if (finished) return
    if (!result.ok) {
      // The typed text stays, so you can press Enter again.
      setPanelStatus(`Not sent: ${result.error || NOT_CONNECTED}. Your text is kept.`)
      return
    }
    replyBox.value = ''
    resizeReply()
  }

  function resizeReply() {
    replyBox.style.height = 'auto'
    replyBox.style.height = `${Math.min(replyBox.scrollHeight, 96)}px`
    replyBox.style.overflowY = replyBox.scrollHeight > 96 ? 'auto' : 'hidden'
  }
  replyBox.addEventListener('input', resizeReply)

  replySend.addEventListener('click', event => {
    if (!event.isTrusted) return
    void sendReply()
  })

  closeButton.addEventListener('click', event => {
    if (!event.isTrusted) return
    openThreadId = null
    renderPanel()
  })

  // Two presses: the first arms the button for 4 seconds, the second resolves.
  resolveButton.addEventListener('click', async event => {
    if (!event.isTrusted || !openThreadId) return
    if (resolveArmedTimer === null) {
      resolveButton.textContent = 'Confirm resolve'
      resolveButton.title = 'Press again to resolve the thread'
      resolveButton.classList.add('confirm')
      resolveArmedTimer = window.setTimeout(disarmResolve, 4000)
      return
    }
    disarmResolve()
    const result = await ask({ type: 'resolve', threadId: openThreadId })
    if (!result.ok) setPanelStatus(result.error || NOT_CONNECTED)
  })

  // ---- Session picker ----

  function showOwner(name, running) {
    sessionName = running ? name : ''
    ownerLabel.textContent = running ? name || 'Claude' : 'No session'
    ownerLabel.classList.toggle('none', !running)
    ownerLabel.title = running ? `Comments go to ${name || 'Claude Code'}. Click to change.` : 'Pick a Claude Code session for this tab'
  }

  function sessionButton(s, current) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'session'
    button.dataset.session = s.sessionId
    button.setAttribute('aria-current', String(s.sessionId === current))
    const name = document.createElement('b')
    name.textContent = s.name
    const folder = document.createElement('small')
    folder.textContent = s.cwd || ''
    folder.title = s.cwd || ''
    button.append(name, folder)
    button.addEventListener('click', async event => {
      if (!event.isTrusted) return
      const answer = await ask({ type: 'pick', sessionId: s.sessionId })
      if (finished) return
      if (!answer.ok) {
        pickerNote.textContent = answer.error || NOT_CONNECTED
        void loadSessions()
        return
      }
      showOwner(answer.sessionName, true)
      picker.style.display = 'none'
      if (target) setStatus('Press Enter to send.')
      void loadThreads()
    })
    return button
  }

  async function loadSessions() {
    const answer = await ask({ type: 'sessions' })
    if (finished) return
    if (!answer.ok) {
      pickerList.replaceChildren()
      pickerNote.textContent = answer.error || NOT_CONNECTED
      return
    }
    const sessions = Array.isArray(answer.sessions) ? answer.sessions : []
    if (sessions.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty'
      const cmd = document.createElement('code')
      cmd.textContent = 'claude'
      empty.append('No Claude Code sessions are running. Start one with ', cmd, ' in your project folder, then press Refresh.')
      pickerList.replaceChildren(empty)
      return
    }
    pickerList.replaceChildren(...sessions.map(s => sessionButton(s, answer.current)))
  }

  async function openPicker(note) {
    pickerNote.textContent = note || ''
    picker.style.display = 'flex'
    await loadSessions()
  }

  ownerLabel.addEventListener('click', event => {
    if (!event.isTrusted) return
    if (picker.style.display === 'flex') picker.style.display = 'none'
    else void openPicker('')
  })

  refreshButton.addEventListener('click', event => {
    if (!event.isTrusted) return
    void loadSessions()
  })

  // Messages from the background: this page's threads changed, or the extension icon was pressed.
  const onRuntimeMessage = (message, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return
    if (message?.type === 'threads-changed') void loadThreads()
    if (message?.type === 'open-picker') void openPicker('')
  }
  chrome.runtime.onMessage.addListener(onRuntimeMessage)
  const onVisibility = () => markReadIfSeen()
  document.addEventListener('visibilitychange', onVisibility)

  // ---- Send ----

  const nextFrame = () => new Promise(resolve => window.requestAnimationFrame(() => resolve()))

  function describeTarget() {
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY,
      dpr: window.devicePixelRatio || 1,
    }
    if (target.kind === 'element') {
      const element = target.element
      const box = element.getBoundingClientRect()
      const text = textOf(element)
      return {
        clip: visibleElementRect(element),
        comment: {
          kind: 'element',
          section: sectionFor(element),
          text: text || undefined,
          selector: cssPath(element) || undefined,
          rect: {
            x: Math.round(box.left + scrollX),
            y: Math.round(box.top + scrollY),
            width: Math.round(box.width),
            height: Math.round(box.height),
          },
          viewport,
        },
      }
    }
    const clip = targetClip()
    const anchor = pickFromPoint(clip.x + clip.width / 2, clip.y + clip.height / 2)
    const text = regionText(clip)
    return {
      clip,
      comment: {
        kind: 'region',
        section: sectionFor(anchor),
        text: text || undefined,
        rect: {
          x: Math.round(target.rect.x),
          y: Math.round(target.rect.y),
          width: Math.round(target.rect.width),
          height: Math.round(target.rect.height),
        },
        viewport,
      },
    }
  }

  async function send() {
    if (sending || !target) return
    const body = comment.value.trim()
    if (!body) {
      setStatus('Type a comment first.')
      return
    }
    if (target.kind === 'element' && !target.element.isConnected) {
      setStatus('The element is gone from the page. Pick it again.')
      return
    }
    const clipNow = targetClip()
    if (!clipNow || clipNow.width === 0 || clipNow.height === 0) {
      setStatus('Scroll the target into view, then send.')
      return
    }
    sending = true
    submit.disabled = true
    setStatus('')
    const { clip, comment: payload } = describeTarget()
    payload.body = body

    // Hide the toolbar for the screenshot, so it shows only the page.
    host.style.setProperty('visibility', 'hidden', 'important')
    await nextFrame()
    await nextFrame()
    const captured = await ask({ type: 'capture', clip, dpr: payload.viewport.dpr })
    host.style.removeProperty('visibility')

    if (!captured.ok) {
      sending = false
      submit.disabled = false
      if (captured.noSession) {
        // The text and the target stay; after a pick, Enter sends them.
        showOwner('', false)
        setStatus('No session. Pick one, then press Enter again.')
        void openPicker('No session. Pick one')
        return
      }
      setStatus(captured.error || NOT_CONNECTED)
      return
    }

    const pin = addPin(payload.rect)
    setPin(pin, 'Sending…', false)
    editor.style.display = 'none'
    targetOutline.style.display = 'none'
    targetLabel.style.display = 'none'

    const result = await ask({ type: 'send', token: captured.token, comment: payload })
    sending = false
    submit.disabled = false
    if (finished) return
    if (result.ok) {
      // The thread's own numbered pin takes this one's place.
      removePin(pin)
      clearTarget()
      openThreadId = result.id
      await loadThreads()
      return
    }
    // Keep the typed text and the target, so you can press Enter again.
    const error = result.error || NOT_CONNECTED
    setPin(pin, `Not sent: ${error}`, true)
    pin.node.title = `Not sent: ${error}\n\n${body}`
    setTarget(target)
    editor.style.display = 'flex'
    setStatus(`Not sent: ${error}. Your text is kept. Press Enter to try again.`)
    queueEditorLayout()
    window.setTimeout(() => comment.focus({ preventScroll: true }), 0)
  }

  submit.addEventListener('click', event => {
    if (!event.isTrusted) return
    void send()
  })

  // Keys inside the editor. Bubble phase, so the textarea handles them first; then hide them from the page.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    root.addEventListener(type, event => {
      event.stopImmediatePropagation()
      if (type !== 'keydown' || !event.isTrusted) return
      if (event.target === comment && isSubmitKey(event)) {
        event.preventDefault()
        void send()
      } else if (event.target === replyBox && isSubmitKey(event)) {
        event.preventDefault()
        void sendReply()
      } else if (event.key === 'Escape' && openThreadId && target === null) {
        event.preventDefault()
        openThreadId = null
        renderPanel()
      }
    })
  }

  // ---- Page input (ported from PickPreload.ts) ----

  function isOwnNode(node) {
    return node === host
  }

  function pickFromPoint(clientX, clientY) {
    for (const candidate of document.elementsFromPoint(clientX, clientY)) {
      if (!(candidate instanceof Element)) continue
      if (isOwnNode(candidate)) continue
      if (candidate === document.documentElement || candidate === document.body) continue
      return candidate
    }
    return null
  }

  function isEditable(node) {
    return (
      node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLSelectElement ||
      (node instanceof HTMLElement && node.isContentEditable)
    )
  }

  const clearHoverOutline = () => {
    hoverOutline.style.display = 'none'
  }

  const onPointerMove = event => {
    if (!event.isTrusted || tool === 'off') return
    if (isOwnNode(event.target)) {
      clearHoverOutline()
      return
    }
    if (tool === 'select' && dragStart === null) {
      const candidate = pickFromPoint(event.clientX, event.clientY)
      if (candidate) positionBox(hoverOutline, visibleElementRect(candidate))
      else clearHoverOutline()
      return
    }
    clearHoverOutline()
    if (tool === 'marquee' && dragStart) {
      positionBox(marqueeBox, normalizeRect(dragStart.x, dragStart.y, event.clientX, event.clientY))
    }
  }

  const onPointerDown = event => {
    if (!event.isTrusted || tool === 'off' || sending) return
    if (event.button !== 0 || isOwnNode(event.target)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (tool === 'select') {
      const picked = pickFromPoint(event.clientX, event.clientY)
      if (!picked) return
      if (target?.kind === 'element' && target.element === picked) setTarget(null)
      else setTarget({ kind: 'element', element: picked })
      setStatus('')
      return
    }
    dragStart = { x: event.clientX, y: event.clientY }
  }

  const onPointerUp = event => {
    if (!event.isTrusted || !dragStart) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (tool === 'marquee') {
      const rect = normalizeRect(dragStart.x, dragStart.y, event.clientX, event.clientY)
      marqueeBox.style.display = 'none'
      if (isUsableRect(rect)) {
        setTarget({
          kind: 'region',
          rect: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
        })
        setStatus('')
      }
    }
    dragStart = null
  }

  const onClick = event => {
    if (tool === 'off' || isOwnNode(event.target)) return
    // A pick must not also click the page's link or button.
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const onPointerOut = event => {
    if (event.relatedTarget === null) clearHoverOutline()
  }

  const onKeyDown = event => {
    if (!event.isTrusted) return
    if (isOwnNode(event.target) && event.key !== 'Escape') return
    if (event.key === 'Escape') {
      if (target === null && tool === 'off') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (sending) return
      if (target !== null) clearTarget()
      else setTool('off')
      return
    }
    if (tool === 'off' || isEditable(event.target)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'v') setTool('select')
    else if (event.key === 'r') setTool('marquee')
  }

  const repaint = () => {
    paintTarget()
    paintPins()
    positionPanel()
    queueEditorLayout()
  }
  // A scrollbar appearing narrows the viewport without a window resize.
  const rootResizeObserver = new ResizeObserver(repaint)

  window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
  window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false })
  window.addEventListener('pointerup', onPointerUp, { capture: true, passive: false })
  window.addEventListener('pointerout', onPointerOut, { capture: true, passive: true })
  window.addEventListener('click', onClick, { capture: true, passive: false })
  window.addEventListener('blur', clearHoverOutline)
  window.addEventListener('keydown', onKeyDown, { capture: true })
  window.addEventListener('scroll', repaint, { capture: true, passive: true })
  window.addEventListener('resize', repaint, { passive: true })

  // ---- Lifetime ----

  // A port to the background, held only to learn when the extension reloads or is removed.
  let lifePort = null
  function openLifePort() {
    try {
      lifePort = chrome.runtime.connect({ name: 'toolbar' })
      lifePort.onDisconnect.addListener(() => {
        lifePort = null
        // The extension context is gone (reload, update, removal): this toolbar can no longer send.
        if (!chrome.runtime?.id) teardown()
        // Otherwise the service worker only restarted. Connect again.
        else window.setTimeout(() => !finished && openLifePort(), 1000)
      })
    } catch {
      teardown()
    }
  }

  function teardown() {
    if (finished) return
    finished = true
    rootResizeObserver.disconnect()
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointerout', onPointerOut, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('blur', clearHoverOutline)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', repaint, true)
    window.removeEventListener('resize', repaint)
    document.removeEventListener('visibilitychange', onVisibility)
    try {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage)
    } catch {}
    disarmResolve()
    if (editorLayoutFrame !== null) window.cancelAnimationFrame(editorLayoutFrame)
    if (document.adoptedStyleSheets.includes(cursorSheet)) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== cursorSheet)
    }
    try {
      lifePort?.disconnect()
    } catch {}
    host.remove()
    if (globalThis[INSTANCE]?.teardown === teardown) delete globalThis[INSTANCE]
  }

  /** Called by a later injection into the same document. Puts the toolbar back if the page removed it. */
  function ensureMounted() {
    if (finished || !chrome.runtime?.id) return false
    if (!host.isConnected) document.documentElement.appendChild(host)
    return true
  }

  globalThis[INSTANCE] = { ensureMounted, teardown }

  document.documentElement.appendChild(host)
  rootResizeObserver.observe(document.documentElement)
  setTool('off')
  openLifePort()
  void ask({ type: 'toolbar-hello' }).then(answer => {
    if (finished) return
    if (!answer.ok) {
      showOwner('', false)
      ownerLabel.title = answer.error || ''
      return
    }
    showOwner(answer.sessionName || '', answer.running)
    if (!answer.hasOwner) void openPicker('')
    else if (!answer.running) void openPicker('No session. Pick one')
    if (answer.hasOwner) void loadThreads()
  })
})()
