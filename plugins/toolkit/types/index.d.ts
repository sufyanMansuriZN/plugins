export type Picture = { file: string; width: number; height: number }

export type Diagram =
  | { status: 'drawn'; picture: Picture; upright?: Picture }
  | { status: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    toolkit: { mermaidDir: string; mermaidDiagram: StateFamily<Diagram>; mermaidIsSource: StateFamily<boolean> }
  }
}
