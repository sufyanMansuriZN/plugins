/** `file` has a transparent background for the terminal; `full`, the same on the theme's background. */
export type Picture = { file: string; full: string; width: number; height: number }

export type Theme = 'light' | 'dark'

/** One diagram drawn for a light and for a dark background; both have the same size. */
export type Pair = Record<Theme, Picture>

/** `turned` is a flowchart drawn in the other direction: left to right for a top to bottom one. */
export type Diagram =
  | ({ status: 'drawn'; turned?: Pair } & Pair)
  | { status: 'failed'; reason: string }

/** What Claude sent to `wrap_up`, parsed. Each answer is a button's label, which is also all a press sends. */
export type WrapUp = { recap: string; ask: string; answers: string[]; isBlocked: boolean }

declare module 'claude-code' {
  interface PluginState {
    toolkit: {
      mermaidDir: string
      mermaidTheme: Theme
      mermaidOpener: string
      mermaidDiagram: StateFamily<Diagram>
      mermaidIsSource: StateFamily<boolean>
      /** A move the change session directory tool started, until its task is submitted. */
      cdPending: { dir: string; task: string } | null
      /** The label of the next step button pressed, by the call's tool_use_id; null until one is. */
      wrapUpAnswer: StateFamily<string | null>
    }
  }
}
