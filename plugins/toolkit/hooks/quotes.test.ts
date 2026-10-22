import { expect, test } from 'claude-code/testing'

import { blocks } from './blocks'
import { findQuotes, splitQuotes } from './quotes'

const DRAFT = ['> Hi Ana,', '>', '> 1. The **fix** is in `main`.', '>> She wrote: done?', '>2. Yes.'].join('\n')

test('a quote loses one > and the space after it on each line, nothing more', () => {
  const [quote] = findQuotes(`Draft:\n\n${DRAFT}\n\nSend it?`)
  expect(quote?.markdown).toBe(DRAFT)
  expect(quote?.text).toBe('Hi Ana,\n\n1. The **fix** is in `main`.\n> She wrote: done?\n2. Yes.')
})

test('a quote inside a code fence is not a quote', () => {
  expect(findQuotes('```\n> not a draft\n```')).toEqual([])
  expect(findQuotes('~~~md\n> not a draft\n~~~\n> a draft').map(quote => quote.text)).toEqual(['a draft'])
})

test('two quotes apart are two quotes, with the text around them', () => {
  expect(splitQuotes('One:\n> first\n\nTwo:\n> second').map(part => (part.kind === 'text' ? part.text : `quote: ${part.quote.text}`))).toEqual([
    'One:',
    'quote: first',
    'Two:',
    'quote: second',
  ])
})

test('a table in a quote stays part of the quote', () => {
  const quoted = '> | a | b |\n> |---|---|\n> | 1 | 2 |'
  expect(blocks(quoted, { mermaid: false }).map(block => block.kind)).toEqual(['quote'])
})
