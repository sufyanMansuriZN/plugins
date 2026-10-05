export type Held = { original: string; polished: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': {
      enabled: boolean
      held?: Held | null
      armed: boolean
    }
  }
}
