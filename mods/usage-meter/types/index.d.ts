export type Meter = {
  windows: { kind: string; percentUsed: number; baseline: number; resetsAt?: string }[]
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { meter: Meter | null; isHidden: boolean }
  }
}
