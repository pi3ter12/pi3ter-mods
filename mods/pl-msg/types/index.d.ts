export type View = { status: 'idle' | 'busy' | 'done' | 'error'; text: string; chars: number }

declare module 'claude-code' {
  interface PluginState {
    'pl-msg': { view: View }
  }
}
