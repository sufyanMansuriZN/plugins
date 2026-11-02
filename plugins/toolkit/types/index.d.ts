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

/** A next step call that asks the user, by the call's tool_use_id. */
export type WrapUpCall = { toolUseId: string; recap: string; question: WrapUpQuestion }

export type PlanStatus = 'pending' | 'in_progress' | 'completed'

/** One step of the task list Claude keeps with `update_plan`. */
export type PlanStep = { content: string; status: PlanStatus }

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'auto' | 'bypassPermissions'

/** Everything a new session starts from, checked; `text` is its whole first message. */
export type Brief = {
  name: string
  context: 'fresh' | 'fork'
  text: string
  /** The folder `claude --bg` runs in; with `isWorktree`, Claude Code cuts its own worktree there (`-w`). */
  cwd: string
  isWorktree: boolean
  model: string | null
  /** The mode Claude asked for; null starts the session in the user's own default mode. */
  permissionMode: PermissionMode | null
}

/** A session start_session started, so its call's row can name it. */
export type StartedSession = {
  name: string
  /** The short id `claude attach`, `logs` and `stop` take. */
  id: string
  /** Where it works: the folder, or the worktree Claude Code cut. */
  where: string
  callId: string
}

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
      /** The restart file a restart tool call wrote, until its turn ends and Claude Code is stopped. */
      restartPending: string | null
      /** The reply row (its uuid) the open task list shows under, from the end of the turn that changed it to the next turn's start. */
      planAt: string | null
      /** The label of the next step button pressed, by the call's tool_use_id; null until one is. */
      wrapUpAnswer: StateFamily<string | null>
      /** The running turn's last next step call with a question, until the turn ends and it moves under the reply. */
      wrapUpPending: WrapUpCall | null
      /** The next step call drawn under a reply block, by the block's requestId. */
      wrapUpAt: StateFamily<WrapUpCall | null>
      /** Whether this next step call moved under its turn's reply, by its tool_use_id; a moved one leaves its row empty. */
      wrapUpIsMoved: StateFamily<boolean>
      /** The newest box with a question, and the reply it is drawn under (null while on its call's row), so a later turn can move it to the end of the transcript. */
      wrapUpLast: { anchor: string | null; call: WrapUpCall } | null
      /** The tool_use_id of the one next step box the session draws: the newest call with a question; null once a typed prompt sets an unanswered one aside. */
      wrapUpCurrent: string | null
      /** The task list drawn above the prompt, and how many prompts the transcript held when it last changed; null when there is none. */
      plan: { steps: PlanStep[]; prompts: number } | null
      /** Whether a long task list above the prompt shows every step; folded to five until "… +N more" is pressed. */
      planIsOpen: boolean
      /** The sessions this one started, oldest first. */
      started: StartedSession[]
    }
  }
}
