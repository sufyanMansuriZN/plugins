export type Picture = { file: string; width: number; height: number }

export type Diagram =
  | { status: 'drawn'; picture: Picture; upright?: Picture }
  | { status: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'mermaid-preview': { dir: string; diagram: StateFamily<Diagram>; isSource: StateFamily<boolean> }
  }
}
