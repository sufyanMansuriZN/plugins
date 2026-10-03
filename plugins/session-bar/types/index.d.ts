export type Limits = { kind: string; percentUsed: number; resetsAt?: string }[]
export type Weekly = { percent: number; name: string; resetsAt?: string }[]
export type Ctx = { tokens: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'session-bar': {
      limits: Limits; weekly: Weekly; fetchedAt: number; ctx?: Ctx
      tick: number
    }
  }
}
