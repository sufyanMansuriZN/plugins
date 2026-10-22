/** `text` is the quote with one `>` and the space after it taken off each line. */
export type Quote = {
  markdown: string
  text: string
  start: number
  end: number
}

export type QuotePart = { kind: 'text'; text: string } | { kind: 'quote'; quote: Quote }

const FENCE = /^\s*(`{3,}|~{3,})/
const QUOTED = /^\s*>/

const unquote = (line: string) => line.replace(/^\s*> ?/, '')

/** The block quotes in a text, outside any code fence; `start` and `end` are line numbers. */
export const findQuotes = (text: string): Quote[] => {
  const lines = text.split('\n')
  const at = (i: number) => lines[i] ?? ''
  const quotes: Quote[] = []
  let fence: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const mark = FENCE.exec(at(i))?.[1]

    if (mark !== undefined) {
      if (fence === null) fence = mark
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null
      continue
    }
    if (fence !== null || !QUOTED.test(at(i))) continue

    let end = i + 1
    while (end < lines.length && QUOTED.test(at(end))) end += 1

    const block = lines.slice(i, end)
    quotes.push({ markdown: block.join('\n'), text: block.map(unquote).join('\n'), start: i, end })
    i = end - 1
  }

  return quotes
}

/** Splits a text into its quotes and the text around them; blank text between them is dropped. */
export const splitQuotes = (text: string): QuotePart[] => {
  const lines = text.split('\n')
  const parts: QuotePart[] = []
  let from = 0
  const pushText = (to: number) => {
    const chunk = lines.slice(from, to).join('\n').replace(/^\n+|\n+$/g, '')
    if (chunk.trim()) parts.push({ kind: 'text', text: chunk })
  }

  for (const quote of findQuotes(text)) {
    pushText(quote.start)
    parts.push({ kind: 'quote', quote })
    from = quote.end
  }
  pushText(lines.length)

  return parts
}
