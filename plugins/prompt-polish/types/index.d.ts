/** Which of the two texts the prompt box shows after a polish; `edited` once the person changed it. */
export type HeldView = 'polished' | 'original' | 'edited'

export type Held = { original: string; polished: string; view: HeldView }

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': {
      enabled: boolean
      /** A task-sized draft is in the box: the hint band shows and the chord has something to polish. */
      ready: boolean
      /** A completion is running. */
      busy: boolean
      held?: Held | null
    }
  }
}
