export type Translation = { source: string; text: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    translator: { history: Translation[]; isBusy: boolean }
  }
}
