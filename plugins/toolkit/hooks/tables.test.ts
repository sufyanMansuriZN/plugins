import { expect, test } from 'claude-code/testing'

import { blocks } from './blocks'
import { findTables, splitTables, toHtml, toTsv } from './tables'

const TABLE = ['| Name | Value |', '| --- | ---: |', '| **a** | `x\\|y` |', '| bb | [link](https://e.com) |'].join('\n')
const REPLY = `Here is the data.\n\n${TABLE}\n\nAnd more text.`

test('finds a table and keeps it as written', () => {
  const [table] = findTables(REPLY)
  expect(table?.markdown).toBe(TABLE)
  expect(table?.header).toEqual(['Name', 'Value'])
  expect(table?.rows).toEqual([['**a**', '`x|y`'], ['bb', '[link](https://e.com)']])
})

test('a table inside a code fence is not a table', () => {
  expect(findTables('```\n| a | b |\n|---|---|\n| 1 | 2 |\n```')).toEqual([])
})

test('a reply splits into its tables and the text around them', () => {
  expect(splitTables(`${REPLY}\n\n${TABLE}`).map(part => (part.kind === 'text' ? part.text : part.table.markdown))).toEqual([
    'Here is the data.',
    TABLE,
    'And more text.',
    TABLE,
  ])
  expect(splitTables(TABLE).map(part => part.kind)).toEqual(['table'])
})

test('formats', () => {
  const [table] = findTables(REPLY)
  if (table === undefined) throw new Error('no table')
  expect(toTsv(table)).toBe('Name\tValue\na\tx|y\nbb\tlink')
  expect(toHtml(table)).toBe(
    '<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>' +
      '<tr><td><b>a</b></td><td><code>x|y</code></td></tr>' +
      '<tr><td>bb</td><td><a href="https://e.com">link</a></td></tr></tbody></table>',
  )
  expect(toHtml({ ...table, header: ['<script>'], rows: [] })).toContain('&lt;script&gt;')
})

test('a table inside a mermaid fence is never a table', () => {
  const fence = '```mermaid\ngraph LR\n  A["| a | b |"]\n  B["|---|---|"]\n```'
  expect(blocks(fence, { mermaid: true }).map(block => block.kind)).toEqual(['mermaid'])
  expect(blocks(fence, { mermaid: false }).map(block => block.kind)).toEqual(['text'])
  expect(blocks(`${fence}\n\n${TABLE}`, { mermaid: true }).map(block => block.kind)).toEqual(['mermaid', 'table'])
})
