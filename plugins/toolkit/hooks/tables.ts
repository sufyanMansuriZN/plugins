export type Table = {
  markdown: string
  header: string[]
  rows: string[][]
  start: number
  end: number
}

export type TablePart = { kind: 'text'; text: string } | { kind: 'table'; table: Table }

const FENCE = /^\s*(`{3,}|~{3,})/
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const isRow = (line: string) => line.includes('|') && line.trim() !== ''

export const splitCells = (line: string): string[] => {
  const cells: string[] = []
  let cell = ''
  let isCode = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (ch === '\\' && line[i + 1] === '|') {
      cell += '|'
      i += 1
    } else if (ch === '`') {
      isCode = !isCode
      cell += ch
    } else if (ch === '|' && !isCode) {
      cells.push(cell)
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell)

  const trimmed = cells.map(c => c.trim())
  if (line.trim().startsWith('|')) trimmed.shift()
  if (line.trim().endsWith('|') && !line.trim().endsWith('\\|')) trimmed.pop()

  return trimmed
}

/** The markdown tables in a text, outside any code fence; `start` and `end` are line numbers. */
export const findTables = (text: string): Table[] => {
  const lines = text.split('\n')
  const at = (i: number) => lines[i] ?? ''
  const tables: Table[] = []
  let fence: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const mark = FENCE.exec(at(i))?.[1]

    if (mark !== undefined) {
      if (fence === null) fence = mark
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue

    const isStart = isRow(at(i)) && at(i + 1).includes('|') && SEPARATOR.test(at(i + 1))
    if (!isStart) continue

    let end = i + 2
    while (end < lines.length && isRow(at(end)) && !FENCE.test(at(end))) end += 1

    const block = lines.slice(i, end)
    tables.push({
      markdown: block.join('\n'),
      header: splitCells(at(i)),
      rows: block.slice(2).map(splitCells),
      start: i,
      end,
    })
    i = end - 1
  }

  return tables
}

/** Splits a text into its tables and the text around them; blank text between them is dropped. */
export const splitTables = (text: string): TablePart[] => {
  const lines = text.split('\n')
  const parts: TablePart[] = []
  let from = 0
  const pushText = (to: number) => {
    const chunk = lines.slice(from, to).join('\n').replace(/^\n+|\n+$/g, '')
    if (chunk.trim()) parts.push({ kind: 'text', text: chunk })
  }

  for (const table of findTables(text)) {
    pushText(table.start)
    parts.push({ kind: 'table', table })
    from = table.end
  }
  pushText(lines.length)

  return parts
}

const plain = (cell: string) =>
  cell
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\t/g, ' ')

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cellHtml = (cell: string) =>
  escapeHtml(cell)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '<b>$1$2</b>')
    .replace(/`([^`]*)`/g, '<code>$1</code>')
    .replace(/\[([^\]]*)\]\((https?:[^)]*)\)/g, '<a href="$2">$1</a>')

export const toTsv = (table: Table): string =>
  [table.header, ...table.rows].map(row => row.map(plain).join('\t')).join('\n')

export const toHtml = (table: Table): string => {
  const row = (cells: string[], tag: 'th' | 'td') =>
    `<tr>${cells.map(c => `<${tag}>${cellHtml(c)}</${tag}>`).join('')}</tr>`

  return `<table><thead>${row(table.header, 'th')}</thead><tbody>${table.rows.map(r => row(r, 'td')).join('')}</tbody></table>`
}
