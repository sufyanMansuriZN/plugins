export type Git = { branch: string; added: number; changed: number }
// tokens: the input tokens of the agent's last request with usage; null before one
export type AgentReading = { model: string; tokens: number | null }

declare module 'claude-code' {
  interface PluginState {
    'session-bar': { agents: Record<string, AgentReading>; git: Git | null; where: string | null; tick: number }
  }
}
