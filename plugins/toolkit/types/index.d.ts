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

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'auto' | 'bypassPermissions'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Where a new session works: a folder as it is, a new worktree of a folder's repository, or the cloud. */
export type Place =
  | { kind: 'folder'; cwd: string }
  | { kind: 'worktree'; root: string; branch: string; source: string | null }
  | { kind: 'cloud'; environment: string | null }

/** Everything a new session starts from, checked; `text` is its whole first message. */
export type Brief = {
  title: string
  name: string
  context: 'fresh' | 'fork'
  text: string
  place: Place
  model: string | null
  effort: Effort | null
  permissionMode: PermissionMode
}

/**
 * A linked session: `starting` until its first reply, `working` while a turn runs, `idle` between
 * turns; ended as `claude agents --json` says (`done`, `stopped`, `failed`), or `gone` once not listed.
 */
export type SessionState = 'starting' | 'working' | 'idle' | 'done' | 'stopped' | 'failed' | 'gone' | (string & {})

/** A session this one started, as the linked sessions list keeps it. */
export type LinkedSession = {
  name: string
  title: string
  /** The short id `claude attach`, `logs` and `stop` take. */
  id: string
  sessionId: string | null
  cwd: string
  branch: string | null
  state: SessionState
  /** The uuid of the last reply already reported back, so each turn end is told once. */
  reported: string | null
  startedAt: number
  /** The start_session call that started it, so that call's row shows its state. */
  callId: string
}

/** A card start_session put up: an offer waiting for the user's answer, or a proposal. */
export type Proposal = {
  taskId: string
  title: string
  initiation: 'offer' | 'own_initiative'
  /** A proposal's brief; an offer gets its brief only once the user picks New session. */
  brief: Brief | null
  status: 'open' | 'new_session' | 'here' | 'started' | 'dismissed'
  /** The name of the session it started. */
  session: string | null
  createdAt: number
}

/** A turn end of a linked session, waiting to be told to this one. */
export type SessionNote = { name: string; id: string; state: SessionState; branch: string | null; report: string }

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
      /** The sessions this one started, oldest first. */
      linked: LinkedSession[]
      /** start_session's cards, by task id. */
      proposals: StateFamily<Proposal | null>
      /** Turn ends of linked sessions not yet told to Claude. */
      notes: SessionNote[]
    }
  }
}
