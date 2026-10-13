export type Limits = { kind: string; percentUsed: number; resetsAt?: string }[]
export type Weekly = { percent: number; name: string; resetsAt?: string }[]
// compactAt: the token count where auto-compaction runs, read once per main turn; absent until read or with it off
export type Ctx = { tokens: number; window: number; compactAt?: number }
export type AgentModels = Record<string, string> // agent id -> the model its latest request named
// the main loop's last model request: when it was sent, whether its response still streams, the TTL read for it, and from its
// usage the model that answered and the counts its transcript line is matched by. cold: the request named another model,
// so the cache is cold until its response ends
export type Cache = { sentAt: number; inFlight: boolean; ttlMs?: number; model?: string; read?: number; input?: number; cold?: true }

declare module 'claude-code' {
  interface PluginState {
    'session-bar': {
      limits: Limits; weekly: Weekly; fetchedAt: number; ctx: Ctx | null
      tick: number; agentModels: AgentModels; usageOpen: boolean; cache: Cache | null
    }
  }
}
