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
  /** The mode Claude asked for; null starts the session in the user's own default mode. */
  permissionMode: PermissionMode | null
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
  startedAt: number
  /** The start_session call that started it, so that call's row shows its state. */
  callId: string
  /** The user stopped its reports to this session. */
  isMuted?: boolean
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
  /** The reply row (message uuid) the card is drawn under once its turn ends; absent while it draws on its call's row. */
  movedTo?: string
}

/** What a started session reads from its link file: the session id that started it, and its own name there. */
export type Link = { parent: string; name: string }

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
      /** The task list drawn above the prompt, and how many prompts the transcript held when it was made; null when there is none. */
      plan: { steps: PlanStep[]; prompts: number } | null
      /** Whether a long task list above the prompt shows every step; folded to five until "… +N more" is pressed. */
      planIsOpen: boolean
      /** Whether the last turn ended with background work (a monitor, a shell) still running, which keeps the task list above the prompt until the next turn. */
      planIsWaiting: boolean
      /** The sessions this one started, oldest first. */
      linked: LinkedSession[]
      /** Whether a start_session call is still starting its session, by the call's tool_use_id (a proposal's task id for a card's start). */
      launching: StateFamily<boolean>
      /** start_session's cards, by task id. */
      proposals: StateFamily<Proposal | null>
      /** The own_initiative cards drawn under a reply block, by its message uuid. */
      cardsAt: StateFamily<string[] | null>
    }
  }
}
