import { split } from './mermaid'
import { splitTables } from './tables'
import type { Table } from './tables'

export type Block = { kind: 'text'; text: string } | { kind: 'mermaid'; fence: string; source: string } | { kind: 'table'; table: Table }

/**
 * Splits a reply into text, tables and, when `mermaid` is on, closed mermaid fences. Mermaid fences
 * come out first, so a table inside one is never a table.
 */
export function blocks(text: string, kinds: { mermaid: boolean }): Block[] {
  const parts: Block[] = kinds.mermaid ? split(text) : [{ kind: 'text', text }]
  return parts.flatMap<Block>(part => (part.kind === 'text' ? splitTables(part.text) : [part]))
}
