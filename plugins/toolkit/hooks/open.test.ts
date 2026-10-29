import { expect, test } from 'claude-code/testing'

import { absolute, fileArgv, fileHref, fileSpans, linkSpans, openArgv, parseHref, placesOf } from './open'

const SESSION = { id: 'abcdef12', name: 'check-the-fix', cwd: '/w/tree' }

test('each terminal offers only the places another program can open there', () => {
  expect(placesOf({ os: 'Linux', termProgram: 'ghostty', termVersion: '1.3.1' })).toEqual(['window'])
  expect(placesOf({ os: 'Linux', termProgram: 'ghostty', termVersion: '1.4.0' })).toEqual(['tab', 'window'])
  // Ghostty on macOS starts no window from the command line.
  expect(placesOf({ os: 'Darwin', termProgram: 'ghostty', termVersion: '1.4.0' })).toEqual([])
  expect(placesOf({ os: 'Linux', tmux: '/tmp/tmux-1/default,1,0', termProgram: 'tmux' })).toEqual(['pane', 'tab', 'popup'])
  expect(placesOf({ os: 'Linux', termProgram: 'gnome-terminal' })).toEqual([])
})

test('a place opens claude attach in the session folder', () => {
  const ghostty = { os: 'Linux', termProgram: 'ghostty', termVersion: '1.4.0' }
  expect(openArgv(ghostty, 'window', SESSION)).toEqual(['ghostty', '+new-window', '--working-directory=/w/tree', '-e', 'claude', 'attach', 'abcdef12'])
  expect(openArgv(ghostty, 'tab', SESSION)).toEqual(['ghostty', '+new-tab', '--working-directory=/w/tree', '--title=check-the-fix', '-e', 'claude', 'attach', 'abcdef12'])
  const tmux = { os: 'Linux', tmux: 'x', tmuxPane: '%3' }
  expect(openArgv(tmux, 'pane', SESSION)).toEqual(['tmux', 'split-window', '-h', '-t', '%3', '-c', '/w/tree', 'claude', 'attach', 'abcdef12'])
  expect(openArgv(tmux, 'tab', SESSION)).toEqual(['tmux', 'new-window', '-n', 'check-the-fix', '-c', '/w/tree', 'claude', 'attach', 'abcdef12'])
  expect(openArgv(tmux, 'popup', SESSION)).toEqual(['tmux', 'display-popup', '-t', '%3', '-E', '-w', '90%', '-h', '90%', '-d', '/w/tree', 'claude attach abcdef12'])
})

test('code opens in the graphical editor at its line, without waiting for it to close', () => {
  expect(fileArgv('/r/a.ts', 12, 'Linux', 'zed --wait', false)).toEqual(['zed', '/r/a.ts:12'])
  expect(fileArgv('/r/a.ts', undefined, 'Linux', 'zed --wait', false)).toEqual(['zed', '/r/a.ts'])
  expect(fileArgv('/r/a.ts', 12, 'Linux', 'code -w', false)).toEqual(['code', '-g', '/r/a.ts:12'])
  expect(fileArgv('/r/a.ts', 12, 'Darwin', '/usr/local/bin/cursor --wait', false)).toEqual(['/usr/local/bin/cursor', '-g', '/r/a.ts:12'])
})

test('folders, pictures and pages open in the desktop app, and so does code with no graphical editor', () => {
  expect(fileArgv('/r/src', undefined, 'Linux', 'zed --wait', true)).toEqual(['xdg-open', '/r/src'])
  expect(fileArgv('/r/out.png', undefined, 'Linux', 'zed --wait', false)).toEqual(['xdg-open', '/r/out.png'])
  expect(fileArgv('/r/report.PDF', undefined, 'Darwin', 'zed --wait', false)).toEqual(['open', '/r/report.PDF'])
  expect(fileArgv('/r/a.ts', 12, 'Linux', 'vim', false)).toEqual(['xdg-open', '/r/a.ts'])
  expect(fileArgv('/r/a.ts', 12, 'Linux', undefined, false)).toEqual(['xdg-open', '/r/a.ts'])
})

test('code spans that look like paths are found, outside fences only', () => {
  const text = [
    'See `plugins/toolkit/hooks/reply.tsx:187` and `README.md`, `~/.bashrc`, `/etc/hosts:3:9`.',
    'Not `claude attach`, `--wait`, `..`, `https://x.y/z` or ``a.b``.',
    '```ts',
    'const a = `x/y.ts`',
    '```',
  ].join('\n')
  expect(fileSpans(text)).toEqual([
    { written: '`plugins/toolkit/hooks/reply.tsx:187`', path: 'plugins/toolkit/hooks/reply.tsx', line: 187 },
    { written: '`README.md`', path: 'README.md' },
    { written: '`~/.bashrc`', path: '~/.bashrc' },
    { written: '`/etc/hosts:3:9`', path: '/etc/hosts', line: 3 },
  ])
})

test('a span becomes a file link that names its path and line, and reads back', () => {
  expect(absolute('a/b.ts', '/w/', '/home/me')).toBe('/w/a/b.ts')
  expect(absolute('./b.ts', '/w', '/home/me')).toBe('/w/b.ts')
  expect(absolute('~/.bashrc', '/w', '/home/me')).toBe('/home/me/.bashrc')
  expect(fileHref('/w/my file.ts', 7)).toBe('file:///w/my%20file.ts#L7')
  expect(parseHref('file:///w/my%20file.ts#L7')).toEqual({ path: '/w/my file.ts', line: 7 })
  expect(parseHref('https://x.y')).toBeUndefined()
  const found = new Map([['`a.ts:2`', 'file:///w/a.ts#L2']])
  expect(linkSpans('Open `a.ts:2`.\n```\n`a.ts:2`\n```', found)).toBe('Open [`a.ts:2`](file:///w/a.ts#L2).\n```\n`a.ts:2`\n```')
})
