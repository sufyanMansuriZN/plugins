import { split } from './mermaid'

export type Block = { kind: 'text'; text: string } | { kind: 'mermaid'; fence: string; source: string }

/** Splits a reply into text and the blocks the tools that are on draw themselves. */
export function blocks(text: string, kinds: { mermaid: boolean }): Block[] {
  return kinds.mermaid ? split(text) : [{ kind: 'text', text }]
}
