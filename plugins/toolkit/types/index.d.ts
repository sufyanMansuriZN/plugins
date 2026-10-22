/** `file` has a transparent background for the terminal; `full`, the same on the theme's background. */
export type Picture = { file: string; full: string; width: number; height: number }

export type Theme = 'light' | 'dark'

/** One diagram drawn for a light and for a dark background; both have the same size. */
export type Pair = Record<Theme, Picture>

/** `turned` is a flowchart drawn in the other direction: left to right for a top to bottom one. */
export type Diagram =
  | ({ status: 'drawn'; turned?: Pair } & Pair)
  | { status: 'failed'; reason: string }

/** The question a next step box asks. Each answer is a button's label, which is also all a press sends. */
export type WrapUpQuestion = { ask: string; answers: string[]; isBlocked: boolean }

/** What Claude sent to `wrap_up`, parsed; `question` is null for a turn with nothing pending, which draws no box. */
export type WrapUp = { recap: string; question: WrapUpQuestion | null }

export type PlanStatus = 'pending' | 'in_progress' | 'completed'

/** One step of the task list Claude keeps with `update_plan`. */
export type PlanStep = { content: string; status: PlanStatus }

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
      /** The task list drawn above the prompt, and how many prompts the transcript held when it was made; null when there is none. */
      plan: { steps: PlanStep[]; prompts: number } | null
    }
  }
}
