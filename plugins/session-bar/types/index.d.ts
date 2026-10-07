export type Limits = { kind: string; percentUsed: number; resetsAt?: string }[]
export type Weekly = { percent: number; name: string; resetsAt?: string }[]
export type Ctx = { tokens: number; window: number }
export type AgentModels = Record<string, string> // agent id -> the model its latest request named

declare module 'claude-code' {
  interface PluginState {
    'session-bar': {
      limits: Limits; weekly: Weekly; fetchedAt: number; ctx?: Ctx
      tick: number; agentModels: AgentModels
    }
  }
}
